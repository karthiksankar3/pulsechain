from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"
    )

    app_name: str = "PulseChain"
    debug: bool = False
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    database_url: str = "postgresql://pulsechain:pulsechain@localhost:5432/pulsechain"
    allowed_origins: list[str] = ["*"]
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "PulseChain/1.0"
    news_api_key: str = ""


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()