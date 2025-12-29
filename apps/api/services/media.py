import os
import uuid
from typing import Optional
from fastapi import UploadFile

MEDIA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "media"))
AUDIO_DIR = os.path.join(MEDIA_ROOT, "audio")

_MIME_EXTENSION_MAP = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
}


def _guess_extension(filename: str, mime: Optional[str]) -> str:
    if mime and mime in _MIME_EXTENSION_MAP:
        return _MIME_EXTENSION_MAP[mime]
    _, ext = os.path.splitext(filename or "")
    if ext:
        return ext
    return ".webm"


def save_audio_file(upload: UploadFile, mime: Optional[str] = None) -> dict:
    os.makedirs(AUDIO_DIR, exist_ok=True)

    content_type = mime or upload.content_type or "application/octet-stream"
    ext = _guess_extension(upload.filename or "", content_type)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(AUDIO_DIR, filename)

    with open(path, "wb") as handle:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    size_bytes = os.path.getsize(path)
    return {
        "url": f"/media/audio/{filename}",
        "mime": content_type,
        "size_bytes": size_bytes,
    }
