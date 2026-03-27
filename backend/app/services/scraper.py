"""
Background scraper service using APScheduler.
Runs periodic data collection jobs regardless of browser connections.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.metrics import InterfaceMetric, BGPMetric
from app.models.settings_db import AppSetting, DEFAULTS
from app.services.junos_service import JunosService

logger = logging.getLogger("jupetrack.scraper")

# ─── Scraper State (shared, thread-safe via GIL for simple reads) ──────────────
_scraper_state = {
    "last_scrape_interface": None,
    "last_scrape_bgp": None,
    "next_run": None,
    "enabled": True,
}

_scheduler: Optional[BackgroundScheduler] = None


def _get_setting(db: Session, key: str) -> str:
    """Read a setting from DB, falling back to DEFAULTS."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else DEFAULTS.get(key, "")


def _ensure_defaults(db: Session):
    """Seed default settings if not already present."""
    for key, value in DEFAULTS.items():
        exists = db.query(AppSetting).filter(AppSetting.key == key).first()
        if not exists:
            db.add(AppSetting(key=key, value=value))
    db.commit()


# ─── Scrape Jobs ───────────────────────────────────────────────────────────────
def _scrape_interfaces():
    """Collect interface traffic data from the Juniper device and store it."""
    db = SessionLocal()
    try:
        if _get_setting(db, "scrape_enabled").lower() != "true":
            return

        now = datetime.now(timezone.utc)
        interfaces = JunosService.get_interface_traffic("global")

        records = [
            InterfaceMetric(
                timestamp=now,
                interface_name=iface["name"],
                interface_type=iface.get("type", "physical"),
                admin_status=iface.get("admin_status"),
                oper_status=iface.get("oper_status"),
                bps_in=iface.get("bps_in", 0),
                bps_out=iface.get("bps_out", 0),
                description=iface.get("description", ""),
            )
            for iface in interfaces
        ]
        db.bulk_save_objects(records)
        db.commit()

        _scraper_state["last_scrape_interface"] = now.isoformat()
        logger.info(f"[Scraper] Interface: saved {len(records)} records @ {now}")

        # Cleanup old records
        retention_days = int(_get_setting(db, "retention_days_interface"))
        cutoff = now - timedelta(days=retention_days)
        deleted = db.query(InterfaceMetric).filter(InterfaceMetric.timestamp < cutoff).delete()
        if deleted > 0:
            db.commit()
            logger.info(f"[Scraper] Retention: deleted {deleted} old interface records")

    except Exception as e:
        logger.error(f"[Scraper] Interface scrape failed: {e}")
        db.rollback()
    finally:
        db.close()


def _scrape_bgp():
    """Collect BGP peer data from all logical systems and store it."""
    db = SessionLocal()
    try:
        if _get_setting(db, "scrape_enabled").lower() != "true":
            return

        now = datetime.now(timezone.utc)
        logical_systems = JunosService.get_logical_systems()

        records = []
        for ls in logical_systems:
            peers = JunosService.get_bgp_summary(ls)
            for peer in peers:
                records.append(BGPMetric(
                    timestamp=now,
                    logical_system=ls,
                    peer_address=peer.get("peer_address", ""),
                    peer_as=peer.get("peer_as"),
                    state=peer.get("state"),
                    description=peer.get("description", ""),
                    active_prefixes=peer.get("active_prefixes", 0),
                    received_prefixes=peer.get("received_prefixes", 0),
                    accepted_prefixes=peer.get("accepted_prefixes", 0),
                ))

        db.bulk_save_objects(records)
        db.commit()

        _scraper_state["last_scrape_bgp"] = now.isoformat()
        logger.info(f"[Scraper] BGP: saved {len(records)} records @ {now}")

        # Cleanup old records
        retention_days = int(_get_setting(db, "retention_days_bgp"))
        cutoff = now - timedelta(days=retention_days)
        deleted = db.query(BGPMetric).filter(BGPMetric.timestamp < cutoff).delete()
        if deleted > 0:
            db.commit()
            logger.info(f"[Scraper] Retention: deleted {deleted} old BGP records")

    except Exception as e:
        logger.error(f"[Scraper] BGP scrape failed: {e}")
        db.rollback()
    finally:
        db.close()


# ─── Scheduler Lifecycle ───────────────────────────────────────────────────────
def start_scheduler():
    """Initialize and start the background scheduler at app startup."""
    global _scheduler

    db = SessionLocal()
    try:
        _ensure_defaults(db)
        interval_seconds = int(_get_setting(db, "scrape_interval_seconds"))
    except Exception:
        interval_seconds = 60
    finally:
        db.close()

    _scheduler = BackgroundScheduler(daemon=True)

    # Interface scrape job
    _scheduler.add_job(
        _scrape_interfaces,
        trigger=IntervalTrigger(seconds=interval_seconds),
        id="scrape_interfaces",
        name="Interface Traffic Scraper",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # BGP scrape job (offset by 15s so they don't pile up)
    _scheduler.add_job(
        _scrape_bgp,
        trigger=IntervalTrigger(seconds=interval_seconds, start_date=datetime.now(timezone.utc) + timedelta(seconds=15)),
        id="scrape_bgp",
        name="BGP Peer Scraper",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    _scheduler.start()
    logger.info(f"[Scraper] Scheduler started. Interval: {interval_seconds}s")


def stop_scheduler():
    """Gracefully shut down the scheduler at app teardown."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scraper] Scheduler stopped.")


def reschedule(interval_seconds: int):
    """Reschedule scraping jobs with a new interval (called from settings API)."""
    global _scheduler
    if not _scheduler or not _scheduler.running:
        return

    _scheduler.reschedule_job(
        "scrape_interfaces",
        trigger=IntervalTrigger(seconds=interval_seconds),
    )
    _scheduler.reschedule_job(
        "scrape_bgp",
        trigger=IntervalTrigger(seconds=interval_seconds, start_date=datetime.now(timezone.utc) + timedelta(seconds=15)),
    )
    logger.info(f"[Scraper] Rescheduled to {interval_seconds}s interval")


def get_scraper_status() -> dict:
    """Return current scraper state for the status API."""
    global _scheduler
    next_run = None
    if _scheduler and _scheduler.running:
        job = _scheduler.get_job("scrape_interfaces")
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()

    db = SessionLocal()
    try:
        iface_count = db.query(InterfaceMetric).count()
        bgp_count = db.query(BGPMetric).count()
    except Exception:
        iface_count = bgp_count = 0
    finally:
        db.close()

    return {
        **_scraper_state,
        "next_run": next_run,
        "total_interface_records": iface_count,
        "total_bgp_records": bgp_count,
    }
