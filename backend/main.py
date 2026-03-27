import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import create_all_tables, SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.routers import bgp, looking_glass, interfaces
from app.routers import auth, metrics
from app.routers import settings as settings_router
from app.services.scraper import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("jupetrack")


def _seed_admin_from_env():
    """Create admin user from env vars if users table is empty."""
    admin_user = os.getenv("ADMIN_USERNAME", "").strip()
    admin_pass = os.getenv("ADMIN_PASSWORD", "").strip()
    if not admin_user or not admin_pass:
        return

    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                username=admin_user,
                hashed_password=hash_password(admin_pass),
                is_active=True,
                is_admin=True,
            )
            db.add(admin)
            db.commit()
            logger.info(f"[Startup] Created admin user '{admin_user}' from environment variables.")
    except Exception as e:
        logger.error(f"[Startup] Failed to seed admin from env: {e}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(application: FastAPI):
    """FastAPI lifespan: startup + shutdown events."""
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("[Startup] Initializing JupeTrack backend...")
    create_all_tables()
    _seed_admin_from_env()
    start_scheduler()
    logger.info("[Startup] Background scraper started. API ready.")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────
    stop_scheduler()
    logger.info("[Shutdown] Scheduler stopped. Goodbye.")


# ─── Application ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="JupeTrack — Juniper MX204 Monitoring API",
    description="Advanced monitoring backend with authentication, historical metrics, and background scraping.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,           prefix="/api/v1/auth")
app.include_router(bgp.router,            prefix="/api/v1")
app.include_router(looking_glass.router,  prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1/settings")
app.include_router(interfaces.router,     prefix="/api/v1")
app.include_router(metrics.router,        prefix="/api/v1/metrics")


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "service": "JupeTrack Monitoring API",
        "version": "2.0.0",
        "docs": "/docs",
    }
