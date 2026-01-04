"""
Debug route for receiving mobile debug logs.
Logs messages to the server console for debugging mobile issues.
"""
import sys
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


class DebugMessage(BaseModel):
    """Model for debug messages from the mobile client."""
    message: str
    source: str = "mobile"


@router.post("/debug/log")
async def log_debug_message(msg: DebugMessage):
    """
    Receives debug messages from the mobile client and logs them to the server console.
    This helps debug mobile-specific issues without needing mobile dev tools.
    """
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    log_line = f"[MOBILE] [{timestamp}] [{msg.source}] {msg.message}"
    # Use sys.stdout with errors='replace' to handle Unicode issues on Windows
    try:
        print(log_line)
    except UnicodeEncodeError:
        # Fallback for Windows terminals that can't handle special characters
        print(log_line.encode('ascii', 'replace').decode('ascii'))
    sys.stdout.flush()
    return {"ok": True}

