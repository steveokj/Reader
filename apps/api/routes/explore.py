import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..models.schemas import ExploreRequest, ExploreResponse

router = APIRouter(prefix="/explore", tags=["explore"])

DEFAULT_INSTRUCTION = (
    "Explore the selection and respond with these sections: "
    "Summary, Key Questions, Connections, and Next Steps. "
    "Keep it concise and practical."
)


def resolve_codex_path() -> str | None:
    override = os.environ.get("CODEX_CLI_PATH")
    if override:
        return override if Path(override).exists() else None
    return shutil.which("codex")


def build_prompt(payload: ExploreRequest) -> str:
    instruction = (payload.instruction or "").strip() or DEFAULT_INSTRUCTION
    selection = payload.selection_text.strip()
    context = (payload.context_text or "").strip()
    parts = [instruction, "", "Selection:", selection]
    if context:
        parts.extend(["", "Context:", context])
    return "\n".join(parts)


def run_codex_cli(prompt: str, timeout_seconds: int) -> str:
    codex_path = resolve_codex_path()
    if not codex_path:
        raise HTTPException(status_code=503, detail="codex CLI not found in PATH.")

    fd, output_path = tempfile.mkstemp(prefix="codex-last-message-")
    os.close(fd)
    root_dir = Path(__file__).resolve().parents[3]
    try:
        result = subprocess.run(
            [codex_path, "exec", "--output-last-message", output_path, prompt],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            cwd=root_dir,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="codex exec timed out.") from exc

    response_text = ""
    try:
        response_text = Path(output_path).read_text(encoding="utf-8").strip()
    except OSError:
        response_text = ""
    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or "codex exec failed."
        raise HTTPException(status_code=502, detail=detail)

    if not response_text:
        response_text = (result.stdout or "").strip()
    if not response_text:
        response_text = "No response text returned."
    return response_text


@router.post("", response_model=ExploreResponse)
def explore(payload: ExploreRequest):
    selection = payload.selection_text.strip()
    if not selection:
        raise HTTPException(status_code=400, detail="selection_text is required.")

    mode = (payload.mode or "mock").strip().lower()
    if mode not in {"mock", "codex-cli"}:
        raise HTTPException(status_code=400, detail="mode must be 'mock' or 'codex-cli'.")

    if mode == "mock":
        preview = selection[:240].strip().replace("\n", " ")
        response = (
            "Mock explore response\n"
            f"Selection length: {len(selection)} characters\n"
            f"Preview: {preview}{'...' if len(selection) > 240 else ''}\n\n"
            "Summary: (stub)\n"
            "Key Questions: (stub)\n"
            "Connections: (stub)\n"
            "Next Steps: (stub)"
        )
        return {"mode": mode, "response_text": response}

    timeout_seconds = payload.timeout_seconds or 45
    prompt = build_prompt(payload)
    response_text = run_codex_cli(prompt, timeout_seconds)
    return {"mode": mode, "response_text": response_text}
