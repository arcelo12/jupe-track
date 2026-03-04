from jnpr.junos import Device
import os
from app.core.config_manager import get_device_config

def get_device():
    """
    Returns a Device instance to connect to the Juniper MX204.
    In a real scenario, manage this connection carefully (e.g., connection pooling
    or opening/closing per request) to prevent exhausting device sessions.
    """
    config = get_device_config()
    
    dev = Device(
        host=config.get("host", ""),
        user=config.get("user", ""),
        password=config.get("password", ""),
        port=int(config.get("port", "830")) if config.get("port") else 830
    )
    return dev
