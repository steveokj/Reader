import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.init import init_db

if sys.platform.startswith("win"):
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

app = FastAPI()

# Load environment variables from the repo root before importing modules that read envs.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

from .routes.additions import router as additions_router
from .routes.documents import router as documents_router
from .routes.explore import router as explore_router
from .routes.explore_chat import router as explore_chat_router
from .routes.lookup import router as lookup_router
from .routes.markers import router as markers_router
from .routes.map_views import router as map_views_router
from .routes.media import router as media_router
from .routes.selections import router as selections_router
from .routes.settings import router as settings_router
from .routes.slicer import router as slicer_router
from .routes.web_additions import router as web_additions_router
from .routes.web_markers import router as web_markers_router
from .routes.web_selections import router as web_selections_router

cors_origins = os.getenv("CORS_ORIGINS").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^(https?://192\.168\.\d+\.\d+(:\d+)?|chrome-extension://[a-z]+)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(documents_router)
app.include_router(selections_router)
app.include_router(additions_router)
app.include_router(markers_router)
app.include_router(map_views_router)
app.include_router(media_router)
app.include_router(explore_router)
app.include_router(explore_chat_router)
app.include_router(lookup_router)
app.include_router(settings_router)
app.include_router(slicer_router)
app.include_router(web_selections_router)
app.include_router(web_additions_router)
app.include_router(web_markers_router)

MEDIA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "media"))
os.makedirs(MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
