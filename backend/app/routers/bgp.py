from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from app.services.junos_service import JunosService
from app.schemas.bgp import LogicalSystem, BGPPeer

router = APIRouter()

@router.get("/logical-systems", response_model=List[str])
async def read_logical_systems():
    """
    Returns a list of all available logical-systems on the device.
    Always includes 'global'.
    """
    systems = JunosService.get_logical_systems()
    return systems

@router.get("/bgp-summary/{logical_system}", response_model=List[BGPPeer])
async def read_bgp_summary(logical_system: str):
    """
    Returns BGP summary for the specified logical system.
    Use 'global' for the main routing instance.
    """
    peers = JunosService.get_bgp_summary(logical_system)
    return peers

@router.get("/bgp-policy/{logical_system}")
async def read_bgp_policy(logical_system: str):
    """
    Returns BGP routing policies (import/export) for peers in a logical system.
    Returns dummy data if no actual connection is established.
    """
    policies = JunosService.get_bgp_routing_policies(logical_system)
    return policies

@router.get("/bgp-logs/{logical_system}/{peer_address}", response_model=List[str])
async def read_bgp_logs(logical_system: str, peer_address: str):
    """
    Returns BGP logs for a specific peer.
    """
    logs = JunosService.get_bgp_logs(logical_system, peer_address)
    return logs
