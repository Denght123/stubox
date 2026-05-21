from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .config import settings
from .schemas import ChatMessage


class ModelCallError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.public_message = message
        self.status_code = status_code


def format_sse(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def _safe_error_detail(content: bytes, limit: int = 240) -> str:
    if not content:
        return ""
    text = content.decode("utf-8", errors="ignore").strip()
    return text[:limit]


def _extract_delta(chunk: dict) -> str:
    choices = chunk.get("choices") or []
    if not choices:
        return ""

    delta = choices[0].get("delta") or {}
    if isinstance(delta, str):
        return delta

    # Some OpenAI-compatible providers stream internal reasoning in
    # `reasoning_content`. The UI should only receive final answer text.
    content = delta.get("content") or ""
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)

    return str(content)


def _extract_stream_error(chunk: dict) -> str:
    error = chunk.get("error")
    if not error:
        return ""

    if isinstance(error, str):
        return error

    if isinstance(error, dict):
        message = error.get("message") or error.get("code") or error.get("type")
        if message:
            return str(message)

    return "模型接口返回流内错误"


async def iter_chat_completion(
    *,
    model: str,
    messages: list[ChatMessage],
    system_prompt: str,
    temperature: float,
) -> AsyncIterator[str]:
    if not settings.api_key or settings.api_key.startswith("sk-your"):
        raise ModelCallError("后端尚未配置 OPENAI_API_KEY，请在 backend/.env 中填写模型服务密钥。")

    payload = {
        "model": model,
        "stream": True,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            *[message.model_dump() for message in messages],
        ],
    }

    if settings.reasoning_effort:
        payload["reasoning_effort"] = settings.reasoning_effort

    if settings.max_completion_tokens > 0:
        payload["max_completion_tokens"] = settings.max_completion_tokens

    timeout = httpx.Timeout(
        timeout=settings.request_timeout_seconds,
        connect=settings.connect_timeout_seconds,
        read=settings.request_timeout_seconds,
        write=settings.connect_timeout_seconds,
        pool=settings.connect_timeout_seconds,
    )

    headers = {
        "Authorization": f"Bearer {settings.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                settings.chat_completions_url,
                headers=headers,
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    detail = _safe_error_detail(await response.aread())
                    message = f"模型接口返回 {response.status_code}"
                    if detail:
                        message = f"{message}: {detail}"
                    raise ModelCallError(message, status_code=response.status_code)

                emitted = False

                async for line in response.aiter_lines():
                    if not line or line.startswith(":"):
                        continue

                    if not line.startswith("data:"):
                        continue

                    raw_data = line.removeprefix("data:").strip()
                    if raw_data == "[DONE]":
                        break

                    try:
                        chunk = json.loads(raw_data)
                    except json.JSONDecodeError:
                        continue

                    stream_error = _extract_stream_error(chunk)
                    if stream_error:
                        raise ModelCallError(stream_error)

                    delta = _extract_delta(chunk)
                    if delta:
                        emitted = True
                        yield delta

                if not emitted:
                    raise ModelCallError("模型接口未返回有效内容")
    except ModelCallError:
        raise
    except httpx.TimeoutException as exc:
        raise ModelCallError("模型接口请求超时") from exc
    except httpx.HTTPError as exc:
        raise ModelCallError(f"模型接口网络异常: {exc.__class__.__name__}") from exc
