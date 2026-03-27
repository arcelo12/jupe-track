from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, BigInteger, Index
from app.core.database import Base


class InterfaceMetric(Base):
    """Stores periodic interface traffic samples from the Juniper device."""
    __tablename__ = "interface_metrics"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    interface_name = Column(String(128), nullable=False, index=True)
    interface_type = Column(String(16), nullable=False, default="physical")  # physical / logical
    admin_status = Column(String(16), nullable=True)
    oper_status = Column(String(16), nullable=True)
    bps_in = Column(BigInteger, nullable=False, default=0)
    bps_out = Column(BigInteger, nullable=False, default=0)
    description = Column(String(255), nullable=True)

    __table_args__ = (
        # Composite index for efficient time-series queries per interface
        Index("ix_iface_name_ts", "interface_name", "timestamp"),
    )

    def __repr__(self):
        return f"<InterfaceMetric {self.interface_name} @ {self.timestamp} in={self.bps_in} out={self.bps_out}>"


class BGPMetric(Base):
    """Stores periodic BGP peer state and prefix count samples."""
    __tablename__ = "bgp_metrics"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    logical_system = Column(String(128), nullable=False, index=True, default="global")
    peer_address = Column(String(64), nullable=False, index=True)
    peer_as = Column(String(32), nullable=True)
    state = Column(String(32), nullable=True)
    description = Column(String(255), nullable=True)
    active_prefixes = Column(Integer, nullable=False, default=0)
    received_prefixes = Column(Integer, nullable=False, default=0)
    accepted_prefixes = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        # Composite index for efficient queries per peer
        Index("ix_bgp_peer_ts", "peer_address", "timestamp"),
        Index("ix_bgp_ls_ts", "logical_system", "timestamp"),
    )

    def __repr__(self):
        return f"<BGPMetric {self.peer_address} @ {self.timestamp} state={self.state}>"
