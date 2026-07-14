from functools import lru_cache
from typing import List, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

_INSECURE_SECRET_DEFAULT = "dev-secret-key-change-in-production"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    supabase_db_url: str = ""

    # Clerk Auth
    clerk_jwks_url: str = ""
    clerk_issuer: str = ""
    clerk_audience: str = ""

    # Security
    allowed_origins: str = "http://localhost:5173"
    secret_key: Optional[str] = None

    # Spond integration
    # Fernet key (urlsafe base64, 32 bytes) used to encrypt stored Spond credentials.
    # Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    spond_encryption_key: Optional[str] = None

    # Environment
    environment: str = "development"
    debug: bool = False

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        is_prod = self.environment.lower() == "production"

        if not self.secret_key or self.secret_key == _INSECURE_SECRET_DEFAULT:
            if is_prod:
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )

        if is_prod and not self.supabase_db_url:
            raise ValueError("SUPABASE_DB_URL must be set in production.")

        if is_prod and not self.clerk_jwks_url:
            raise ValueError("CLERK_JWKS_URL must be set in production.")

        return self

    @property
    def cors_origins(self) -> List[str]:
        """Parse allowed origins into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment.lower() == "production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()







