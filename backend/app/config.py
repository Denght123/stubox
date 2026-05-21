from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file(ROOT_DIR / ".env")
_load_env_file(BACKEND_DIR / ".env")


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return [item.strip() for item in value.split(",") if item.strip()]


def _get_optional_str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _parse_csv(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    items = [item.strip().lower() for item in value.split(",") if item.strip()]
    return items or default


@dataclass(frozen=True)
class Settings:
    base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    api_key: str = os.getenv("OPENAI_API_KEY", "")
    primary_model: str = os.getenv("PRIMARY_MODEL", "gpt-4o-mini")
    backup_model: str = os.getenv("BACKUP_MODEL", "gpt-4.1-mini")
    reasoning_effort: str = _get_optional_str("MODEL_REASONING_EFFORT", "low")
    max_completion_tokens: int = int(_get_float("MAX_COMPLETION_TOKENS", 1200))
    request_timeout_seconds: float = _get_float("REQUEST_TIMEOUT_SECONDS", 45)
    connect_timeout_seconds: float = _get_float("CONNECT_TIMEOUT_SECONDS", 8)
    web_search_enabled: bool = _get_bool("WEB_SEARCH_ENABLED", True)
    web_search_provider: str = _get_optional_str("WEB_SEARCH_PROVIDER", "bing").lower()
    web_search_max_results: int = int(_get_float("WEB_SEARCH_MAX_RESULTS", 4))
    web_search_timeout_seconds: float = _get_float("WEB_SEARCH_TIMEOUT_SECONDS", 8)
    web_fetch_timeout_seconds: float = _get_float("WEB_FETCH_TIMEOUT_SECONDS", 9)
    web_search_official_domains: list[str] = None  # type: ignore[assignment]
    web_search_user_agent: str = _get_optional_str(
        "WEB_SEARCH_USER_AGENT",
        "Mozilla/5.0 (compatible; HBWEAdmissionsAI/0.1; +https://www.hbwe.edu.cn/)",
    )
    agent_path: Path = ROOT_DIR / "agent.md"
    cors_origins: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "cors_origins",
            _parse_origins(os.getenv("CORS_ORIGINS")),
        )
        object.__setattr__(
            self,
            "web_search_official_domains",
            _parse_csv(
                os.getenv("WEB_SEARCH_OFFICIAL_DOMAINS"),
                ["hbwe.edu.cn", "zsb.hbwe.edu.cn"],
            ),
        )

    @property
    def chat_completions_url(self) -> str:
        return f"{self.base_url}/chat/completions"

    def model_sequence(self) -> list[str]:
        models: list[str] = []
        for model in (self.primary_model, self.backup_model):
            clean = model.strip()
            if clean and clean not in models:
                models.append(clean)
        return models


settings = Settings()
