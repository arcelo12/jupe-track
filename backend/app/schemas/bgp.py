from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class LogicalSystem(BaseModel):
    name: str

class BGPPeer(BaseModel):
    peer_address: str
    peer_as: str
    state: str
    direction: Optional[str] = None
    description: Optional[str] = None
    uptime: Optional[str] = None
    input_messages: Optional[int] = None
    output_messages: Optional[int] = None
    active_prefixes: Optional[int] = None
    received_prefixes: Optional[int] = None
    accepted_prefixes: Optional[int] = None

class BGPPolicyItem(BaseModel):
    term_name: str
    from_conditions: List[str]
    then_actions: List[str]

class BGPPolicy(BaseModel):
    policy_name: str
    terms: List[BGPPolicyItem]

class BGPPeerPolicy(BaseModel):
    peer_address: str
    import_policies: List[str]
    export_policies: List[str]
    policy_details: Dict[str, BGPPolicy]
