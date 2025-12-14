from contextlib import asynccontextmanager
from typing import AsyncGenerator
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.deps.rate_limit import limiter
from app.api.middleware.security import add_security_headers
from app.api.routers import events, games, groups, health, players, rankings
from app.config import get_settings
from app.exceptions import AppException
from app.infrastructure.db.connection import close_db_pool, init_db_pool
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)

# Check if running on Vercel (serverless)
IS_VERCEL = os.getenv("VERCEL") == "1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    logger.info("Starting application...")
    try:
        # For serverless, we'll initialize the pool lazily on first use
        # But try to initialize it here if not on Vercel
        if not IS_VERCEL:
            await init_db_pool()
    except Exception as e:
        logger.warning(f"Failed to initialize database pool at startup: {e}")
        logger.info("Will attempt lazy initialization on first database request")
    yield
    logger.info("Shutting down application...")
    try:
        await close_db_pool()
    except Exception as e:
        logger.warning(f"Error closing database pool: {e}")


class CORSErrorMiddleware(BaseHTTPMiddleware):
    """Middleware to ensure CORS headers are added even on errors."""
    
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Unhandled exception: {e}")
            try:
                settings = get_settings()
                cors_origins = settings.cors_origins
            except:
                cors_origins = ["*"]
            
            origin = request.headers.get("origin", "")
            
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
            )
            
            # Add CORS headers if origin is allowed
            if cors_origins == ["*"] or origin in cors_origins:
                response.headers["Access-Control-Allow-Origin"] = origin or "*"
                response.headers["Access-Control-Allow-Credentials"] = "true"
            
            return response


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    try:
        settings = get_settings()
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
        # Create a minimal app even if settings fail
        settings = None

    app = FastAPI(
        title="Pickleball Matchmaking API",
        description="API for pickleball event matchmaking and ranking",
        version="1.0.0",
        docs_url="/docs" if (settings and not settings.is_production) else None,
        redoc_url="/redoc" if (settings and not settings.is_production) else None,
        lifespan=lifespan,
    )

    # Rate limiting
    try:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    except Exception as e:
        logger.warning(f"Failed to setup rate limiting: {e}")

    # CORS - must be added BEFORE other middleware
    cors_origins = settings.cors_origins if settings else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    # Add CORS error handling middleware
    app.add_middleware(CORSErrorMiddleware)

    # Security headers middleware
    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next):
        response = await call_next(request)
        return add_security_headers(response)

    # Exception handler for app exceptions
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    # Catch-all exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # Include routers
    app.include_router(health.router, prefix="/api", tags=["Health"])
    app.include_router(groups.router, prefix="/api", tags=["Groups"])
    app.include_router(players.router, prefix="/api", tags=["Players"])
    app.include_router(events.router, prefix="/api", tags=["Events"])
    app.include_router(games.router, prefix="/api", tags=["Games"])
    app.include_router(rankings.router, prefix="/api", tags=["Rankings"])

    return app


# Create the app instance
try:
    app = create_app()
    logger.info("FastAPI application created successfully")
except Exception as e:
    logger.error(f"Failed to create FastAPI application: {e}", exc_info=True)
    # Create a minimal app for error reporting
    app = FastAPI(title="Pickleball Matchmaking API")
    
    @app.get("/")
    async def error_root():
        return {"error": "Application failed to initialize", "detail": str(e)}
    
    @app.get("/api/health")
    async def error_health():
        return {"status": "error", "detail": "Application initialization failed"}

