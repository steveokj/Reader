from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.init import init_db
from .routes.documents import router as documents_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
