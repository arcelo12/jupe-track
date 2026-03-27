from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.metrics import InterfaceMetric, BGPMetric
from app.models.settings_db import AppSetting, DEFAULTS
from app.schemas.metrics import (
    InterfaceHistoryResponse, InterfaceMetricPoint,
    BGPHistoryResponse, BGPMetricPoint,
    RetentionSettings, ScraperStatus,
)
from app.middleware.auth_middleware import get_current_user
from app.services import scraper as scraper_service

router = APIRouter(tags=["Metrics & History"])


# ─── Helpers ────────────────────────────────────────────────────────────────────
def _get_setting(db: Session, key: str) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else DEFAULTS.get(key, "")


def _set_setting(db: Session, key: str, value: str):
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def _parse_range(hours: int = 24) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=hours)


# ─── Interface History ─────────────────────────────────────────────────────────
@router.get("/interfaces/history", response_model=List[InterfaceHistoryResponse])
def get_interface_history(
    interface_name: Optional[str] = Query(None, description="Filter by interface name"),
    hours: int = Query(24, ge=1, le=168, description="Lookback hours (1-168)"),
    limit: int = Query(500, ge=10, le=2000, description="Max data points"),
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """
    Return time-series interface traffic data.
    Query by specific interface or get all interfaces for current period.
    """
    since = _parse_range(hours)
    query = db.query(InterfaceMetric).filter(InterfaceMetric.timestamp >= since)

    if interface_name:
        query = query.filter(InterfaceMetric.interface_name == interface_name)

    records = query.order_by(InterfaceMetric.timestamp.asc()).limit(limit * 20).all()

    # Group by interface name
    grouped: dict[str, list] = {}
    for r in records:
        key = r.interface_name
        if key not in grouped:
            grouped[key] = {"type": r.interface_type, "points": []}
        grouped[key]["points"].append(InterfaceMetricPoint(
            timestamp=r.timestamp,
            bps_in=r.bps_in,
            bps_out=r.bps_out,
        ))

    return [
        InterfaceHistoryResponse(
            interface_name=name,
            interface_type=data["type"],
            points=data["points"][-limit:],
        )
        for name, data in grouped.items()
    ]


@router.get("/interfaces/names", response_model=List[str])
def get_interface_names(
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """Return distinct interface names available in the metrics database."""
    rows = db.query(InterfaceMetric.interface_name).distinct().all()
    return [r[0] for r in rows]


# ─── BGP History ───────────────────────────────────────────────────────────────
@router.get("/bgp/history", response_model=List[BGPHistoryResponse])
def get_bgp_history(
    peer_address: Optional[str] = Query(None, description="Filter by peer IP"),
    logical_system: Optional[str] = Query(None, description="Filter by logical system"),
    hours: int = Query(24, ge=1, le=168, description="Lookback hours"),
    limit: int = Query(500, ge=10, le=2000, description="Max data points per peer"),
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """Return time-series BGP peer prefix counts and state history."""
    since = _parse_range(hours)
    query = db.query(BGPMetric).filter(BGPMetric.timestamp >= since)

    if peer_address:
        query = query.filter(BGPMetric.peer_address == peer_address)
    if logical_system:
        query = query.filter(BGPMetric.logical_system == logical_system)

    records = query.order_by(BGPMetric.timestamp.asc()).limit(limit * 20).all()

    # Group by peer
    grouped: dict[str, dict] = {}
    for r in records:
        key = r.peer_address
        if key not in grouped:
            grouped[key] = {"peer_as": r.peer_as, "ls": r.logical_system, "points": []}
        grouped[key]["points"].append(BGPMetricPoint(
            timestamp=r.timestamp,
            state=r.state,
            active_prefixes=r.active_prefixes,
            received_prefixes=r.received_prefixes,
            accepted_prefixes=r.accepted_prefixes,
        ))

    return [
        BGPHistoryResponse(
            peer_address=addr,
            peer_as=data["peer_as"],
            logical_system=data["ls"],
            points=data["points"][-limit:],
        )
        for addr, data in grouped.items()
    ]


@router.get("/bgp/peers", response_model=List[str])
def get_bgp_peer_addresses(
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """Return distinct BGP peer addresses available in the metrics database."""
    rows = db.query(BGPMetric.peer_address).distinct().all()
    return [r[0] for r in rows]


# ─── Retention Settings ────────────────────────────────────────────────────────
@router.get("/retention", response_model=RetentionSettings)
def get_retention(
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """Get current data retention and scraper settings."""
    return RetentionSettings(
        retention_days_interface=int(_get_setting(db, "retention_days_interface")),
        retention_days_bgp=int(_get_setting(db, "retention_days_bgp")),
        scrape_interval_seconds=int(_get_setting(db, "scrape_interval_seconds")),
        scrape_enabled=_get_setting(db, "scrape_enabled").lower() == "true",
    )


@router.put("/retention", response_model=RetentionSettings)
def update_retention(
    settings: RetentionSettings,
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """Update data retention and scraper settings."""
    if settings.retention_days_interface < 1 or settings.retention_days_interface > 365:
        raise HTTPException(400, "retention_days_interface must be 1-365")
    if settings.retention_days_bgp < 1 or settings.retention_days_bgp > 365:
        raise HTTPException(400, "retention_days_bgp must be 1-365")
    if settings.scrape_interval_seconds < 10 or settings.scrape_interval_seconds > 3600:
        raise HTTPException(400, "scrape_interval_seconds must be 10-3600")

    _set_setting(db, "retention_days_interface", str(settings.retention_days_interface))
    _set_setting(db, "retention_days_bgp", str(settings.retention_days_bgp))
    _set_setting(db, "scrape_interval_seconds", str(settings.scrape_interval_seconds))
    _set_setting(db, "scrape_enabled", str(settings.scrape_enabled).lower())

    # Reschedule background jobs with new interval
    scraper_service.reschedule(settings.scrape_interval_seconds)

    return settings


# ─── Scraper Status ────────────────────────────────────────────────────────────
@router.get("/status", response_model=ScraperStatus)
def get_scraper_status(
    db: Session = Depends(get_db),
    _ = Depends(get_current_user),
):
    """Return current background scraper status and record counts."""
    state = scraper_service.get_scraper_status()
    enabled = _get_setting(db, "scrape_enabled").lower() == "true"
    return ScraperStatus(
        enabled=enabled,
        last_scrape_interface=state.get("last_scrape_interface"),
        last_scrape_bgp=state.get("last_scrape_bgp"),
        next_run=state.get("next_run"),
        total_interface_records=state.get("total_interface_records", 0),
        total_bgp_records=state.get("total_bgp_records", 0),
    )
