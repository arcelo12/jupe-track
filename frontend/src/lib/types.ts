export interface BGPPeer {
  peer_address: string;
  peer_as: string;
  state: string;
  description?: string;
  uptime?: string;
  input_messages?: number;
  output_messages?: number;
  active_prefixes?: number;
  received_prefixes?: number;
  accepted_prefixes?: number;
  advertised_prefixes?: number;
  afi?: string;
  router_id?: string;
}

export interface BGPPolicyItem {
  term_name: string;
  from_conditions: string[];
  then_actions: string[];
}

export interface BGPPolicy {
  policy_name: string;
  terms: BGPPolicyItem[];
}

export interface BGPPeerPolicy {
  peer_address: string;
  import_policies: string[];
  export_policies: string[];
  policy_details: Record<string, BGPPolicy>;
}

export interface InterfaceInfo {
  name: string;
  description: string;
  type: 'physical' | 'logical';
  admin_status: string;
  oper_status: string;
  bps_in: number;
  bps_out: number;
}
