from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .agent_prompt import load_agent_prompt
from .config import settings
from .openai_client import ModelCallError, format_sse, iter_chat_completion
from .schemas import ChatRequest
from .web_search import (
    compact_sources_for_client,
    format_web_context,
    search_official_web,
    should_use_web_search,
)


app = FastAPI(
    title="河北水利电力学院招生 AI 问答系统",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "primary_model": settings.primary_model,
        "backup_model": settings.backup_model,
        "agent_path": str(settings.agent_path),
        "web_search_enabled": settings.web_search_enabled,
        "web_search_provider": settings.web_search_provider,
        "web_search_official_domains": settings.web_search_official_domains,
    }


@app.post("/api/chat/stream")
async def chat_stream(request_body: ChatRequest, request: Request) -> StreamingResponse:
    async def event_generator() -> AsyncIterator[str]:
        prompt = load_agent_prompt()
        models = settings.model_sequence()
        messages = [message for message in request_body.messages if message.role != "system"]

        if not models:
            yield format_sse("error", {"message": "后端未配置可用模型。"})
            yield format_sse("done", {"model": None})
            return

        if not messages:
            yield format_sse("error", {"message": "请先输入一个招生咨询问题。"})
            yield format_sse("done", {"model": None})
            return

        if messages[-1].role != "user":
            yield format_sse("error", {"message": "最后一条消息必须来自用户。"})
            yield format_sse("done", {"model": None})
            return

        last_error = ""
        web_context = ""
        should_search = request_body.web_search == "on" or (
            request_body.web_search == "auto" and should_use_web_search(messages)
        )

        if should_search:
            yield format_sse("search_start", {"message": "联网搜索中", "query": messages[-1].content})
            search_result = await search_official_web(messages[-1].content)
            web_context = format_web_context(search_result)

            if search_result.error:
                yield format_sse(
                    "search_error",
                    {
                        "message": "联网搜索暂时不可用，将继续按已有官方口径回答，并提示以官网最新通知为准。",
                        "detail": search_result.error,
                    },
                )
            else:
                source_count = len(search_result.sources)
                yield format_sse(
                    "search_done",
                    {
                        "message": "联网搜索完成" if source_count else "未检索到可用的学校官方网页资料，将继续谨慎回答。",
                        "count": source_count,
                        "sources": compact_sources_for_client(search_result.sources),
                    },
                )

        if web_context:
            prompt = f"{prompt}\n\n{web_context}"

        for index, model in enumerate(models):
            emitted_content = False

            if await request.is_disconnected():
                return

            if index > 0:
                yield format_sse(
                    "fallback",
                    {
                        "from": models[index - 1],
                        "to": model,
                        "reason": last_error or "主模型暂不可用",
                    },
                )

            yield format_sse("model", {"model": model, "backup": index > 0})

            try:
                async for delta in iter_chat_completion(
                    model=model,
                    messages=messages,
                    system_prompt=prompt,
                    temperature=request_body.temperature,
                ):
                    if await request.is_disconnected():
                        return

                    emitted_content = True
                    yield format_sse("delta", {"content": delta})

                yield format_sse("done", {"model": model})
                return
            except ModelCallError as exc:
                last_error = exc.public_message
                if emitted_content:
                    yield format_sse(
                        "error",
                        {
                            "message": "模型流式输出中断，请稍后重试。",
                            "model": model,
                        },
                    )
                    yield format_sse("done", {"model": model})
                    return

                continue

        yield format_sse(
            "error",
            {
                "message": "主备模型都暂时不可用，请稍后再试。",
                "detail": last_error,
            },
        )
        yield format_sse("done", {"model": None})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
