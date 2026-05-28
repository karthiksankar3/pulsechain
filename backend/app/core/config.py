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
    allowed_origins: list[str] = [
        "https://cozy-fulfillment-production-f71f.up.railway.app",
        "https://pulsechain-production-7896.up.railway.app",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ]
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "PulseChain/1.0"
    news_api_key: str = ""


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()