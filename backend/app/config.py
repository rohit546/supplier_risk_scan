from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. All values overridable via environment / .env."""

    # LLM provider: "gemini" | "openai" | "anthropic". Falls back to
    # deterministic rule-based reasoning when no API key is configured.
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    gemini_model: str = "gemini-flash-latest"
    openai_model: str = "gpt-4o-mini"
    anthropic_model: str = "claude-3-5-haiku-latest"
    llm_timeout_seconds: float = 20.0

    # LLM trigger mode:
    #   "manual" (default) — alerts are raised in a "pending" state and the
    #     LLM is only called when an operator explicitly requests an assessment
    #     (POST /api/alerts/{id}/assess). Best for demos/assessments: the call
    #     is observable and intentional.
    #   "auto" — the agent calls the LLM automatically the moment an alert fires.
    llm_mode: str = "manual"

    # Agent loop
    scan_interval_seconds: float = 20.0
    scan_batch_size: int = 3
    alert_cooldown_minutes: int = 30

    # Scoring weights (must sum to 1.0)
    weight_financial: float = 0.22
    weight_operational: float = 0.24
    weight_compliance: float = 0.20
    weight_geopolitical: float = 0.18
    weight_esg: float = 0.16

    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
