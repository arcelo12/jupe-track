from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class InterfaceMetricPoint(BaseModel):
    timestamp: datetime
    bps_in: int
    bps_out: int

    model_config = {"from_attributes": True}


class InterfaceHistoryResponse(BaseModel):
    interface_name: str
    interface_type: str
    points: List[InterfaceMetricPoint]


class BGPMetricPoint(BaseModel):
    timestamp: datetime
    state: Optional[str]
    active_prefixes: int
    received_prefixes: int
    accepted_prefixes: int

    model_config = {"from_attributes": True}


class BGPHistoryResponse(BaseModel):
    peer_address: str
    peer_as: Optional[str]
    logical_system: str
    points: List[BGPMetricPoint]


class RetentionSettings(BaseModel):
    retention_days_interface: int = 30
    retention_days_bgp: int = 30
    scrape_interval_seconds: int = 60
    scrape_enabled: bool = True


class ScraperStatus(BaseModel):
    enabled: bool
    last_scrape_interface: Optional[str] = None
    last_scrape_bgp: Optional[str] = None
    next_run: Optional[str] = None
    total_interface_records: int = 0
    total_bgp_records: int = 0
