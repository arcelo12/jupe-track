from typing import List, Dict, Any
from app.core.device import get_device
from lxml import etree

class JunosService:
    @staticmethod
    def get_logical_systems() -> List[str]:
        """
        Fetches the list of configured logical-systems.
        Returns ['global'] as a default entry if any are found, or just 'global' if none.
        """
        systems = ["global"]
        try:
            with get_device() as dev:
                # Retrieve configuration for logical-systems only
                config = dev.rpc.get_config(filter_xml=etree.XML('<configuration><logical-systems/></configuration>'))
                ls_nodes = config.xpath('.//logical-systems/name')
                for node in ls_nodes:
                    if node.text:
                        systems.append(node.text)
        except Exception as e:
            print(f"Error fetching logical systems (returning default): {e}")
            # Mock data for demonstration when no device is available
            systems.extend(["LS-Client-A", "LS-Service-B"])
            
        return systems
    @staticmethod
    def get_bgp_summary(logical_system: str = "global") -> List[Dict[str, Any]]:
        """
        Fetches BGP peer summary for a specific logical system.
        """
        peers = []
        try:
            with get_device() as dev:
                kwargs = {}
                if logical_system != "global":
                    kwargs["logical_system"] = logical_system
                
                # Using PyEZ RPC for BGP summary
                response = dev.rpc.get_bgp_summary_information(**kwargs)
                
                # Also fetch BGP configuration to get peer descriptions
                config_filter = f'<configuration><protocols><bgp/></protocols></configuration>'
                if logical_system != "global":
                    config_filter = f'<configuration><logical-systems><name>{logical_system}</name><protocols><bgp/></protocols></logical-systems></configuration>'
                
                config_resp = dev.rpc.get_config(filter_xml=etree.XML(config_filter))
                
                # Extract descriptions
                desc_map = {}
                peer_configs = config_resp.xpath('.//neighbor')
                for pc in peer_configs:
                    addr = pc.findtext('name')
                    desc = pc.findtext('description')
                    if addr and desc:
                        desc_map[addr] = desc
                
                peer_nodes = response.xpath('.//bgp-peer')
                for peer in peer_nodes:
                    peer_addr = peer.findtext('peer-address')
                    peer_as = peer.findtext('peer-as')
                    state = peer.findtext('peer-state')
                    uptime = peer.findtext('elapsed-time')
                    active_prefixes = peer.findtext('bgp-rib/active-prefix-count')
                    received_prefixes = peer.findtext('bgp-rib/received-prefix-count')
                    accepted_prefixes = peer.findtext('bgp-rib/accepted-prefix-count')
                    
                    peers.append({
                        "peer_address": peer_addr or "Unknown",
                        "peer_as": peer_as or "Unknown",
                        "state": state or "Unknown",
                        "description": desc_map.get(peer_addr),
                        "uptime": uptime,
                        "active_prefixes": int(active_prefixes) if active_prefixes and active_prefixes.isdigit() else 0,
                        "received_prefixes": int(received_prefixes) if received_prefixes and received_prefixes.isdigit() else 0,
                        "accepted_prefixes": int(accepted_prefixes) if accepted_prefixes and accepted_prefixes.isdigit() else 0
                    })
        except Exception as e:
            print(f"Error fetching BGP summary for {logical_system} (returning mock data): {e}")
            # Return mock data when no device is available
            peers = [
                {
                    "peer_address": "192.168.0.1",
                    "peer_as": "65000",
                    "state": "Established",
                    "description": "Primary Transit Provider",
                    "uptime": "100:00:00",
                    "active_prefixes": 100,
                    "received_prefixes": 120,
                    "accepted_prefixes": 100
                },
                {
                    "peer_address": "10.0.0.1",
                    "peer_as": "65001",
                    "state": "Idle",
                    "description": "Backup Link",
                    "uptime": None,
                    "active_prefixes": 0,
                    "received_prefixes": 0,
                    "accepted_prefixes": 0
                }
            ]
        return peers

    @staticmethod
    def get_bgp_routing_policies(logical_system: str = "global") -> Dict[str, Any]:
        """
        Fetches the read-only BGP routing policies by reading configurations.
        """
        policies = {}
        try:
            with get_device() as dev:
                # 1. Get BGP Configuration (to find which policies are applied to which peers)
                bgp_filter = f'<configuration><protocols><bgp/></protocols></configuration>'
                if logical_system != "global":
                    bgp_filter = f'<configuration><logical-systems><name>{logical_system}</name><protocols><bgp/></protocols></logical-systems></configuration>'
                
                bgp_config = dev.rpc.get_config(filter_xml=etree.XML(bgp_filter))
                
                # We need to collect all unique policy names applied across all peers
                all_policy_names = set()
                
                # Parse groups to handle policy inheritance
                groups = bgp_config.xpath('.//group')
                for group in groups:
                    group_import = [p.text for p in group.xpath('./import')]
                    group_export = [p.text for p in group.xpath('./export')]
                    
                    for peer in group.xpath('.//neighbor'):
                        peer_addr = peer.findtext('name')
                        if not peer_addr:
                            continue
                        
                        peer_import = [p.text for p in peer.xpath('./import')]
                        peer_export = [p.text for p in peer.xpath('./export')]
                        
                        # Combine neighbor policies with inherited group policies
                        # Junos evaluates neighbor policies, then group policies.
                        import_policies = list(dict.fromkeys(peer_import + group_import))
                        export_policies = list(dict.fromkeys(peer_export + group_export))
                        
                        all_policy_names.update(import_policies)
                        all_policy_names.update(export_policies)
                        
                        policies[peer_addr] = {
                            "peer_address": peer_addr,
                            "import_policies": import_policies,
                            "export_policies": export_policies,
                            "policy_details": {}
                        }
                
                # 2. Get Policy-Options Configuration (to get the details of those specific policies)
                if all_policy_names:
                    policy_filter = f'<configuration><policy-options/></configuration>'
                    if logical_system != "global":
                        policy_filter = f'<configuration><logical-systems><name>{logical_system}</name><policy-options/></logical-systems></configuration>'
                    
                    policy_config = dev.rpc.get_config(filter_xml=etree.XML(policy_filter))
                    
                    # Parse policy-statement nodes
                    statement_nodes = policy_config.xpath('.//policy-statement')
                    parsed_policies = {}
                    
                    for stmt in statement_nodes:
                        name = stmt.findtext('name')
                        if name not in all_policy_names:
                            continue
                        
                        terms = []
                        term_nodes = stmt.xpath('term')
                        for term in term_nodes:
                            term_name = term.findtext('name') or "unnamed"
                            
                            # Advanced parsing of 'from' conditions (handling nested tags like route-filter)
                            from_conds = []
                            for f in term.xpath('from/*'):
                                tag = etree.QName(f).localname
                                if tag == 'route-filter':
                                    addr = f.findtext('address') or ""
                                    match_type = ""
                                    for child in f:
                                        child_tag = etree.QName(child).localname
                                        if child_tag != 'address':
                                            match_type = child_tag
                                    from_conds.append(f"route-filter {addr} {match_type}".strip())
                                elif tag == 'prefix-list-filter':
                                    pfx_name = f.findtext('name') or ""
                                    match_type = ""
                                    for child in f:
                                        child_tag = etree.QName(child).localname
                                        if child_tag != 'name':
                                            match_type = child_tag
                                    from_conds.append(f"prefix-list-filter {pfx_name} {match_type}".strip())
                                else:
                                    text = f.text if f.text else ""
                                    from_conds.append(f"{tag}{' ' + text if text and text.strip() else ''}")
                            
                            then_acts = []
                            for t in term.xpath('then/*'):
                                tag = etree.QName(t).localname
                                if tag == 'community':
                                    action = "set"
                                    if t.find('add') is not None: action = "add"
                                    elif t.find('delete') is not None: action = "delete"
                                    
                                    comm_name = t.findtext('community-name') or ""
                                    then_acts.append(f"community {action} {comm_name}".strip())
                                else:
                                    text = t.text if t.text else ""
                                    then_acts.append(f"{tag}{' ' + text if text and text.strip() else ''}")
                                
                            terms.append({
                                "term_name": term_name,
                                "from_conditions": from_conds,
                                "then_actions": then_acts
                            })
                            
                        parsed_policies[name] = {
                            "policy_name": name,
                            "terms": terms
                        }
                    
                    # Attach parsed policies to the respective peers
                    for peer_addr, peer_data in policies.items():
                        for pol_name in peer_data["import_policies"] + peer_data["export_policies"]:
                            if pol_name in parsed_policies:
                                peer_data["policy_details"][pol_name] = parsed_policies[pol_name]

        except Exception as e:
            print(f"Error fetching BGP policies for {logical_system} (returning mock data): {e}")
            policies = {
                 "192.168.0.1": {
                     "peer_address": "192.168.0.1",
                     "import_policies": ["IMPORT-AS65000"],
                     "export_policies": ["EXPORT-ALL"],
                     "policy_details": {
                         "IMPORT-AS65000": {
                             "policy_name": "IMPORT-AS65000",
                             "terms": [
                                 {
                                     "term_name": "ACCEPT_BGP",
                                     "from_conditions": ["protocol bgp", "route-filter 10.0.0.0/8 orlonger"],
                                     "then_actions": ["accept"]
                                 }
                             ]
                         }
                     }
                 }
             }
        
        return policies

    @staticmethod
    def get_bgp_logs(logical_system: str, peer_address: str) -> List[str]:
        """
        Fetches BGP logs for a specific peer.
        Uses RPC to execute `show log messages | match <peer_ip>`.
        """
        logs = []
        try:
            with get_device() as dev:
                command = f"show log messages | match {peer_address}"
                
                # dev.cli is often available in PyEZ, but dev.rpc.cli is the underlying call.
                # using dev.rpc.cli(command, format="text") to get unstructured text
                response = dev.rpc.cli(command, format="text")
                if response is not None and getattr(response, 'text', None):
                    log_text = response.text.strip()
                    if log_text:
                        logs = log_text.split('\n')
                elif isinstance(response, str):
                    logs = response.strip().split('\n')
        except Exception as e:
            print(f"Error fetching BGP logs for {peer_address} (returning mock data): {e}")
            logs = [
                f"Mar  2 12:00:00 rtr-1 rpd[1234]: BGP_PEER_STATE_TRANSITION: peer {peer_address} state Established",
                f"Mar  2 12:05:00 rtr-1 rpd[1234]: bgp_read_v4_update: peer {peer_address} (External AS) received bad update",
                f"Mar  2 12:10:00 rtr-1 rpd[1234]: BGP_PREFIX_LIMIT_EXCEEDED: peer {peer_address} prefix limit 1000 exceeded",
                f"Mar  2 12:15:00 rtr-1 rpd[1234]: bgp_recv: peer {peer_address} (External AS) connection reset",
                f"Mar  2 12:20:00 rtr-1 rpd[1234]: BGP_PEER_STATE_TRANSITION: peer {peer_address} state Active",
            ]
        
        # Return last 50 lines to keep it manageable
        return logs[-50:]

    @staticmethod
    def get_interface_traffic(logical_system: str = "global") -> List[Dict[str, Any]]:
        """
        Fetches interface bandwidth statistics for physical AND logical interfaces.
        Physical: uses traffic-statistics (statistics=True).
        Logical: uses transit-traffic-statistics (detail=True).
        """
        ALLOWED_PREFIXES = ('ge-', 'xe-', 'et-')

        def _parse_bps(node, tag='input-bps'):
            val = node.findtext(tag)
            if val:
                val = val.strip()
                if val.isdigit():
                    return int(val)
            return 0

        interfaces = []
        try:
            with get_device() as dev:
                # Use detail=True so that logical-interface transit-traffic-statistics include bps
                response = dev.rpc.get_interface_information(statistics=True, detail=True)
                physical_interfaces = response.xpath('.//physical-interface')

                for iface in physical_interfaces:
                    name = iface.findtext('name')
                    if not name:
                        continue
                    name = name.strip()
                    if not any(name.startswith(p) for p in ALLOWED_PREFIXES):
                        continue

                    admin_status = (iface.findtext('admin-status') or '').strip()
                    oper_status = (iface.findtext('oper-status') or '').strip()

                    # Physical-level BPS from traffic-statistics
                    stats = iface.find('traffic-statistics')
                    bps_in = _parse_bps(stats) if stats is not None else 0
                    bps_out = _parse_bps(stats, 'output-bps') if stats is not None else 0

                    interfaces.append({
                        "name": name,
                        "type": "physical",
                        "admin_status": admin_status,
                        "oper_status": oper_status,
                        "bps_in": bps_in,
                        "bps_out": bps_out
                    })

                    # Logical sub-interfaces (units) from transit-traffic-statistics
                    for li in iface.xpath('logical-interface'):
                        li_name = (li.findtext('name') or '').strip()
                        if not li_name:
                            continue

                        li_admin = (li.findtext('admin-status') or oper_status).strip()
                        li_oper = (li.findtext('oper-status') or oper_status).strip()

                        # Transit traffic stats carry actual bps for logical interfaces
                        tts = li.find('transit-traffic-statistics')
                        li_bps_in = _parse_bps(tts) if tts is not None else 0
                        li_bps_out = _parse_bps(tts, 'output-bps') if tts is not None else 0

                        interfaces.append({
                            "name": li_name,
                            "type": "logical",
                            "admin_status": li_admin,
                            "oper_status": li_oper,
                            "bps_in": li_bps_in,
                            "bps_out": li_bps_out
                        })

        except Exception as e:
            print(f"Error fetching interface traffic (returning mock data): {e}")
            import random
            interfaces = [
                {"name": "et-0/0/0", "type": "physical", "admin_status": "up", "oper_status": "up", "bps_in": random.randint(1_000_000_000, 12_000_000_000), "bps_out": random.randint(1_000_000_000, 12_000_000_000)},
                {"name": "et-0/0/0.0", "type": "logical", "admin_status": "up", "oper_status": "up", "bps_in": random.randint(100_000_000, 6_000_000_000), "bps_out": random.randint(100_000_000, 6_000_000_000)},
                {"name": "et-0/0/1", "type": "physical", "admin_status": "up", "oper_status": "up", "bps_in": random.randint(500_000_000, 8_000_000_000), "bps_out": random.randint(500_000_000, 8_000_000_000)},
                {"name": "xe-0/1/0", "type": "physical", "admin_status": "up", "oper_status": "down", "bps_in": 0, "bps_out": 0},
            ]

        return interfaces

