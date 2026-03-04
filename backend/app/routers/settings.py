from fastapi import APIRouter, HTTPException
from app.core.config_manager import get_device_config, save_device_config
from app.schemas.settings import DeviceSettings, DeviceSettingsResponse

router = APIRouter()

@router.get("/device", response_model=DeviceSettingsResponse)
def read_device_settings():
    """Retrieve current device connection settings."""
    config = get_device_config()
    # Mask password for frontend
    safe_config = config.copy()
    if safe_config.get("password") and safe_config.get("password") != "":
        safe_config["password"] = "********"
        
    return DeviceSettingsResponse(success=True, config=safe_config)

@router.post("/device", response_model=DeviceSettingsResponse)
def update_device_settings(settings: DeviceSettings):
    """Update device connection settings."""
    config = settings.model_dump()
    
    # If password is submitted as masked, do not override existing password
    if config.get("password") == "********":
        current_config = get_device_config()
        config["password"] = current_config.get("password", "")
        
    if save_device_config(config):
        return DeviceSettingsResponse(success=True, message="Device settings updated successfully.")
    else:
        raise HTTPException(status_code=500, detail="Failed to save device settings")
