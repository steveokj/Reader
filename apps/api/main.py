import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.init import init_db
from .routes.additions import router as additions_router
from .routes.debug import router as debug_router
from .routes.documents import router as documents_router
from .routes.markers import router as markers_router
from .routes.media import router as media_router
from .routes.selections import router as selections_router



app = FastAPI()

# Near the top of the file
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3002").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://192\.168\.\d+\.\d+(:\d+)?$",
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


app.include_router(debug_router)
app.include_router(documents_router)
app.include_router(selections_router)
app.include_router(additions_router)
app.include_router(markers_router)
app.include_router(media_router)

MEDIA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "media"))
os.makedirs(MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
