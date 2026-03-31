import logging
import sys
from typing import Optional

from app.config import get_settings


def setup_logging(level: Optional[str] = None) -> None:
    """Configure application logging."""
    try:
        settings = get_settings()
        log_level = level or ("DEBUG" if settings.debug else "INFO")
    except Exception:
        log_level = level or "INFO"

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)







