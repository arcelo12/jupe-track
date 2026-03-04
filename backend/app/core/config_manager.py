import os
import json
from typing import Dict, Any

# In Docker, we map a volume to /app/data, so use that directory
CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
CONFIG_FILE = os.path.join(CONFIG_DIR, "device_config.json")

def get_device_config() -> Dict[str, Any]:
    """Retrieve device config from JSON file, fallback to env vars."""
    config = {
        "host": os.getenv("JUNOS_HOST", ""),
        "user": os.getenv("JUNOS_USER", ""),
        "password": os.getenv("JUNOS_PASS", ""),
        "port": os.getenv("JUNOS_PORT", "830"),
    }
    
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            print(f"Error reading {CONFIG_FILE}: {e}")
            
    return config

def save_device_config(new_config: Dict[str, Any]) -> bool:
    """Save new device config to the JSON file."""
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        # Only save allowed keys
        allowed_keys = ["host", "user", "password", "port"]
        filtered_config = {k: v for k, v in new_config.items() if k in allowed_keys}
        
        with open(CONFIG_FILE, "w") as f:
            json.dump(filtered_config, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving {CONFIG_FILE}: {e}")
        return False
