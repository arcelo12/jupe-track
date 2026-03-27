from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from app.core.database import Base


class AppSetting(Base):
    """Key-value store for application settings, persisted in the database."""
    __tablename__ = "app_settings"

    key = Column(String(128), primary_key=True, nullable=False)
    value = Column(String(512), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    def __repr__(self):
        return f"<AppSetting {self.key}={self.value}>"


# ─── Default Setting Keys ──────────────────────────────────────────────────────
DEFAULTS: dict[str, str] = {
    "retention_days_interface": "30",    # Days to keep interface metrics
    "retention_days_bgp": "30",         # Days to keep BGP metrics
    "scrape_interval_seconds": "60",    # Background scrape interval
    "scrape_enabled": "true",           # Enable/disable background scraping
}
