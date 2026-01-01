import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import (
    ExploreChatRequest,
    ExploreChatResponse,
    ExploreThreadsResponse,
    ExploreThreadUpdate,
)
from ..services import explore_chat as explore_chat_service

router = APIRouter(prefix="/explore/chat", tags=["explore"])

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful reading companion. Respond to the user's last message, "
    "keep continuity with the chat history, and be concise."
)


def resolve_codex_path() -> str | None:
    override = os.environ.get("CODEX_CLI_PATH")
    if override:
        return override if Path(override).exists() else None
    return shutil.which("codex")


def _find_session_id(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        for key, entry in value.items():
            if key in {"session_id", "sessionId", "conversation_id", "thread_id", "threadId"}:
                if isinstance(entry, str) and entry.strip():
                    return entry
            if key == "session" and isinstance(entry, dict):
                session_id = entry.get("id")
                if isinstance(session_id, str) and session_id.strip():
                    return session_id
            found = _find_session_id(entry)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_session_id(item)
            if found:
                return found
    return None


def _extract_session_id(stdout: str) -> Optional[str]:
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        session_id = _find_session_id(payload)
        if session_id:
            return session_id
    return None


def _read_last_message(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def run_codex_cli(
    prompt: str,
    timeout_seconds: int,
    *,
    resume_last: bool = False,
    session_id: Optional[str] = None,
) -> tuple[str, Optional[str], str]:
    codex_path = resolve_codex_path()
    if not codex_path:
        raise HTTPException(status_code=503, detail="codex CLI not found in PATH.")

    fd, output_path = tempfile.mkstemp(prefix="codex-last-message-")
    os.close(fd)
    root_dir = Path(__file__).resolve().parents[3]
    cmd: list[str] = [
        codex_path,
        "exec",
        "--output-last-message",
        output_path,
        "--json",
    ]
    if session_id:
        cmd.extend(["resume", session_id, "-"])
    elif resume_last:
        cmd.extend(["resume", "--last", "-"])
    else:
        cmd.append("-")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            cwd=root_dir,
            input=prompt,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="codex exec timed out.") from exc
    finally:
        response_text = _read_last_message(output_path)
        try:
            os.remove(output_path)
        except OSError:
            pass

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or "codex exec failed."
        raise HTTPException(status_code=502, detail=detail)

    session = _extract_session_id(result.stdout or "")
    if not response_text:
        response_text = (result.stdout or "").strip() or "No response text returned."
    return response_text, session, result.stdout or ""


def _build_start_prompt(system_prompt: str, message: str) -> str:
    return "\n".join([system_prompt.strip(), "", "User:", message.strip()])


@router.post("", response_model=ExploreChatResponse)
def explore_chat(payload: ExploreChatRequest):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required.")

    mode = (payload.mode or "codex-cli").strip().lower()
    if mode not in {"mock", "codex-cli"}:
        raise HTTPException(status_code=400, detail="mode must be 'mock' or 'codex-cli'.")

    action = (payload.action or "").strip().lower()
    if action and action not in {"new", "resume"}:
        raise HTTPException(status_code=400, detail="action must be 'new' or 'resume'.")

    conn = get_conn()
    try:
        thread = None
        if payload.thread_id and action != "new":
            thread = explore_chat_service.get_thread(conn, payload.thread_id)
            if not thread:
                raise HTTPException(status_code=404, detail="Thread not found.")

        if not thread:
            system_prompt = (payload.system_prompt or DEFAULT_SYSTEM_PROMPT).strip()
            title = payload.title.strip() if payload.title else None
            if not title:
                title = (message[:48] + "...") if len(message) > 48 else message
            thread = explore_chat_service.create_thread(conn, title, system_prompt, None)

        explore_chat_service.add_message(conn, thread["id"], "user", message)

        if mode == "mock":
            response_text = f"Mock reply: {message[:240]}"
            session_id = None
        else:
            timeout_seconds = payload.timeout_seconds or 60
            prompt = message
            resume_last = False
            session_id = thread.get("cli_session_id")
            session_mode = thread.get("session_mode") or "pinned"
            if action == "resume" or (action == "" and payload.thread_id):
                if session_mode == "pinned" and session_id:
                    response_text, session_id, _ = run_codex_cli(
                        prompt,
                        timeout_seconds,
                        session_id=session_id,
                    )
                else:
                    response_text, session_id, _ = run_codex_cli(
                        prompt,
                        timeout_seconds,
                        resume_last=True,
                    )
            else:
                system_prompt = thread.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
                prompt = _build_start_prompt(system_prompt, message)
                response_text, session_id, _ = run_codex_cli(
                    prompt,
                    timeout_seconds,
                    resume_last=resume_last,
                )

            if session_id and not thread.get("cli_session_id"):
                explore_chat_service.update_thread_session(conn, thread["id"], session_id)

        assistant_message = explore_chat_service.add_message(
            conn, thread["id"], "assistant", response_text
        )
        explore_chat_service.touch_thread(conn, thread["id"])

        return {
            "thread": thread,
            "messages": [assistant_message],
            "mode": mode,
        }
    finally:
        conn.close()


@router.get("/{thread_id}", response_model=ExploreChatResponse)
def get_thread(thread_id: int):
    conn = get_conn()
    try:
        thread = explore_chat_service.get_thread(conn, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found.")
        messages = explore_chat_service.list_messages(conn, thread_id)
        return {
            "thread": thread,
            "messages": messages,
            "mode": "codex-cli",
        }
    finally:
        conn.close()


@router.patch("/{thread_id}", response_model=ExploreChatResponse)
def update_thread(thread_id: int, payload: ExploreThreadUpdate):
    conn = get_conn()
    try:
        if payload.session_mode and payload.session_mode not in {"pinned", "last"}:
            raise HTTPException(status_code=400, detail="session_mode must be 'pinned' or 'last'.")
        thread = explore_chat_service.update_thread(
            conn,
            thread_id,
            title=payload.title,
            system_prompt=payload.system_prompt,
            session_mode=payload.session_mode,
        )
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found.")
        messages = explore_chat_service.list_messages(conn, thread_id)
        return {"thread": thread, "messages": messages, "mode": "codex-cli"}
    finally:
        conn.close()


@router.delete("/{thread_id}")
def delete_thread(thread_id: int):
    conn = get_conn()
    try:
        thread = explore_chat_service.get_thread(conn, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found.")
        explore_chat_service.delete_thread(conn, thread_id)
        return {"ok": True}
    finally:
        conn.close()
