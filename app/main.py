"""MycoGuard FastAPI backend.

Serves as a thin proxy so that LLM credentials NEVER reach the browser:
  - POST /api/analyze  → qwen-vl-plus vision analysis (base64 image proxied)
  - POST /api/chat     → safety-knowledge Q&A (rule-first, optional LLM)
  - GET  /api/health   → capability probe used by the frontend to decide
                         online vs pure-offline mode

Run:  uvicorn app.main:app --port 8000   (from the repo root)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import Settings, load_settings
from .knowledge.entries import ENTRIES
from .services.chat import answer_question
from .services.knowledge import KnowledgeBase
from .services.llm_client import LLMClient, LLMError
from .services.vision import VisionError, analyze_image

APP_VERSION = "2.0.0"


class ChatRequest(BaseModel):
    question: str = ""


def _make_vision_llm(settings: Settings) -> LLMClient:
    return LLMClient(
        base_url=settings.dashscope_openai_compat_url,
        api_key=settings.dashscope_api_key,
        model=settings.vision_model,
    )


def _make_chat_llm(settings: Settings) -> LLMClient:
    return LLMClient(
        base_url=settings.deepseek_openai_compat_url,
        api_key=settings.deepseek_api_key,
        model=settings.chat_model,
    )


def create_app(
    settings: Settings | None = None,
    vision_llm=None,
    chat_llm=None,
) -> FastAPI:
    """Build the app with injectable dependencies (used by tests)."""
    settings = settings or load_settings()

    app = FastAPI(title="MycoGuard API", version=APP_VERSION)
    app.state.settings = settings
    app.state.vision_llm = (
        vision_llm
        if vision_llm is not None
        else (_make_vision_llm(settings) if settings.dashscope_api_key else None)
    )
    app.state.chat_llm = (
        chat_llm
        if chat_llm is not None
        else (_make_chat_llm(settings) if settings.deepseek_api_key else None)
    )
    app.state.kb = KnowledgeBase(ENTRIES)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {
            "status": "ok",
            "version": APP_VERSION,
            "vision": app.state.vision_llm is not None,
            "chat": app.state.chat_llm is not None,
        }

    @app.post("/api/analyze")
    async def analyze(file: UploadFile = File(...)) -> dict:
        llm = app.state.vision_llm
        if llm is None:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=503,
                content={
                    "detail": "视觉服务未配置（离线模式）。请在后端配置 DASHSCOPE_API_KEY 后重试。",
                    "offline": True,
                },
            )
        mime = file.content_type or "application/octet-stream"
        data = await file.read()
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="图片过大（上限 8MB）。")

        try:
            return analyze_image(llm, data, mime)
        except VisionError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        except LLMError as exc:
            raise HTTPException(status_code=502, detail=f"视觉模型调用失败：{exc}") from exc
        except Exception as exc:  # unexpected upstream failure → still a 502
            raise HTTPException(status_code=502, detail=f"视觉服务异常：{exc}") from exc

    @app.post("/api/chat")
    def chat(req: ChatRequest) -> dict:
        question = (req.question or "").strip()
        if not question:
            raise HTTPException(status_code=422, detail="question 不能为空")
        return answer_question(app.state.kb, question, llm=app.state.chat_llm)

    # Production: serve the built frontend from ../dist when present.
    dist = Path(__file__).resolve().parent.parent / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")

    return app


app = create_app()
