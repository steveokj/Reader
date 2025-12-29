from fastapi import APIRouter, File, Form, UploadFile

from ..services.media import save_audio_file

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/audio")
def upload_audio(file: UploadFile = File(...), mime: str | None = Form(None)):
    return save_audio_file(file, mime)
