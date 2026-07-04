from fastapi import APIRouter
from app.services.junos_service import JunosService

router = APIRouter(tags=["Interfaces"])

@router.get("/interfaces/traffic/{logical_system}")
async def get_traffic(logical_system: str):
    """
    Get live interface traffic statistics.
    """
    interfaces = JunosService.get_interface_traffic(logical_system)
    return interfaces
