from __future__ import annotations

from pathlib import Path

from .config import settings


FALLBACK_PROMPT = """你现在是【河北水利电力学院】的官方招生 AI 助手。你只能回答与学校设施、招生政策、专业介绍、校园生活等相关的内容。如果用户询问与学校无关的话题，请委婉拒绝并引导用户回到学校招生话题上。绝对不要回答任何政治、娱乐或其他无关领域的问答。"""


def load_agent_prompt(path: Path | None = None) -> str:
    prompt_path = path or settings.agent_path
    try:
        content = prompt_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return FALLBACK_PROMPT

    return content or FALLBACK_PROMPT
