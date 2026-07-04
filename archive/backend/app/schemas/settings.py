from pydantic import BaseModel
from typing import Optional

class DeviceSettings(BaseModel):
    host: str
    user: str
    password: str
    port: str

class DeviceSettingsResponse(BaseModel):
    success: bool
    config: Optional[DeviceSettings] = None
    message: Optional[str] = None
