from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.core.device import get_device
from lxml import etree
import time
from datetime import datetime
import socket

router = APIRouter()

def get_asn_from_cymru(ip):
    if not ip or ip.startswith("*"): return ""
    try:
        with socket.create_connection(("whois.cymru.com", 43), timeout=2) as s:
            s.sendall(f"begin\n{ip}\nend\n".encode('utf-8'))
            data = b""
            while True:
                chunk = s.recv(4096)
                if not chunk: break
                data += chunk
            for line in data.decode('utf-8').split('\n'):
                if '|' in line and not line.strip().startswith('AS'):
                    parts = [p.strip() for p in line.split('|')]
                    asn = parts[0]
                    return f"[AS{asn}]" if asn != "NA" else ""
    except Exception:
        pass
    return ""

def get_ptr_for_ip(ip):
    if not ip or ip.startswith("*"): return ip
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip

class LookingGlassRequest(BaseModel):
    command: str
    target: Optional[str] = None
    source_address: Optional[str] = None
    logical_system: Optional[str] = "global"
    resolve_ptr: bool = False
    resolve_asn: bool = False

ALLOWED_COMMANDS = [
    "show_route",
    "ping",
    "traceroute",
    "show_bgp_neighbor",
    "show_bgp_summary",
    "show_interfaces",
]

@router.post("/looking-glass")
async def looking_glass(req: LookingGlassRequest):
    """
    Execute read-only looking glass commands on the Juniper MX204.
    Only whitelisted commands are allowed for security.
    """
    if req.command not in ALLOWED_COMMANDS:
        return {"success": False, "error": f"Command '{req.command}' not allowed. Allowed: {ALLOWED_COMMANDS}"}
    
    try:
        debug_log: List[str] = []
        t_start = time.time()
        debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Request received: {req.command}" + (f" target={req.target}" if req.target else "") + (f" source={req.source_address}" if req.source_address else ""))
        debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Logical system: {req.logical_system}")
        
        t_conn = time.time()
        debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Connecting to device via NETCONF...")
        
        with get_device() as dev:
            t_connected = time.time()
            debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] ✓ Connected ({(t_connected - t_conn)*1000:.0f}ms)")
            debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Device: {dev.facts.get('model', 'unknown')} | Hostname: {dev.facts.get('hostname', 'unknown')} | Version: {dev.facts.get('version', 'unknown')}")
            
            result = ""
            raw_xml_size = 0
            
            if req.command == "show_route":
                kwargs = {}
                if req.target:
                    kwargs["destination"] = req.target
                if req.logical_system and req.logical_system != "global":
                    kwargs["logical_system"] = req.logical_system
                
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Sending RPC: get-route-information {kwargs}")
                t_rpc = time.time()
                response = dev.rpc.get_route_information(**kwargs)
                raw_xml = etree.tostring(response, pretty_print=True, encoding="unicode")
                raw_xml_size = len(raw_xml.encode('utf-8'))
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] ✓ RPC response received ({(time.time()-t_rpc)*1000:.0f}ms, {raw_xml_size:,} bytes XML)")
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Parsing route table...")
                
                # Parse into a more readable format
                lines = []
                tables = response.xpath('.//route-table')
                for table in tables:
                    table_name = table.findtext('table-name') or "unknown"
                    lines.append(f"\n{'='*60}")
                    lines.append(f"Routing Table: {table_name}")
                    lines.append(f"{'='*60}")
                    
                    routes = table.xpath('rt')
                    for rt in routes:
                        dest = rt.findtext('rt-destination') or ""
                        entries = rt.xpath('rt-entry')
                        for entry in entries:
                            proto = entry.findtext('protocol-name') or ""
                            pref = entry.findtext('preference') or ""
                            age = entry.findtext('age') or ""
                            nh = entry.findtext('.//to') or entry.findtext('.//nh/to') or ""
                            via = entry.findtext('.//via') or ""
                            lines.append(f"  {dest:<24} [{proto}/{pref}] age: {age}")
                            if nh:
                                lines.append(f"    > to {nh} via {via}")
                
                result = "\n".join(lines) if lines else "No routes found."
            
            elif req.command == "ping":
                if not req.target:
                    return {"success": False, "error": "Target IP/hostname required for ping"}
                ping_kwargs = {"host": req.target, "count": "5", "rapid": True}
                if req.source_address:
                    ping_kwargs["source"] = req.source_address
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Sending RPC: ping {ping_kwargs}")
                t_rpc = time.time()
                response = dev.rpc.ping(**ping_kwargs)
                raw_xml = etree.tostring(response, pretty_print=True, encoding="unicode")
                raw_xml_size = len(raw_xml.encode('utf-8'))
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] ✓ Ping response received ({(time.time()-t_rpc)*1000:.0f}ms, {raw_xml_size:,} bytes XML)")
                
                # Parse ping results
                lines = []
                probe_results = response.findtext('.//probe-results-summary/probes-sent')
                probes_recv = response.findtext('.//probe-results-summary/responses-received')
                loss = response.findtext('.//probe-results-summary/packet-loss')
                rtt_min = response.findtext('.//probe-results-summary/rtt-minimum')
                rtt_avg = response.findtext('.//probe-results-summary/rtt-average')
                rtt_max = response.findtext('.//probe-results-summary/rtt-maximum')
                
                target_ip = response.findtext('.//target-ip') or req.target
                lines.append(f"PING {req.target} ({target_ip})")
                lines.append(f"")
                lines.append(f"--- ping statistics ---")
                lines.append(f"{probe_results or '5'} packets transmitted, {probes_recv or '?'} received, {loss or '?'}% packet loss")
                if rtt_min:
                    lines.append(f"rtt min/avg/max = {rtt_min}/{rtt_avg}/{rtt_max} ms")
                
                result = "\n".join(lines)
            
            elif req.command == "traceroute":
                if not req.target:
                    return {"success": False, "error": "Target IP/hostname required for traceroute"}
                tr_kwargs = {"host": req.target}
                if req.source_address:
                    tr_kwargs["source"] = req.source_address
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Sending RPC: traceroute {tr_kwargs}")
                t_rpc = time.time()
                response = dev.rpc.traceroute(**tr_kwargs)
                raw_xml = etree.tostring(response, pretty_print=True, encoding="unicode")
                raw_xml_size = len(raw_xml.encode('utf-8'))
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] ✓ Traceroute response received ({(time.time()-t_rpc)*1000:.0f}ms, {raw_xml_size:,} bytes XML)")
                
                # Parse traceroute — Juniper XML format:
                # <traceroute-results><hop><ttl-value>, <probe-result>...
                # Each probe-result has: <ip-address>, <host-name>, <rtt> (microseconds)
                # or <probe-failure> for timeouts
                debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Parsing traceroute hops...")
                
                lines = [f"traceroute to {req.target}"]
                
                hops = response.xpath('.//hop')
                if not hops:
                    # Fallback: try to extract text content directly
                    text_content = response.text or etree.tostring(response, method="text", encoding="unicode")
                    if text_content and text_content.strip():
                        lines.append(text_content.strip())
                    else:
                        lines.append("No hops found in response.")
                        # Dump raw XML to debug for troubleshooting
                        debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Raw XML preview: {raw_xml[:500]}")
                else:
                    for hop in hops:
                        ttl_val = hop.findtext('ttl-value') or hop.findtext('hop-number') or "?"
                        ttl = ttl_val.strip()
                        probes = hop.xpath('.//probe-result')
                        
                        if probes:
                            # Standard traceroute format:
                            # 1  host.name (ip.add.re.ss) [AS123] 1.234 ms  1.456 ms  1.890 ms
                            
                            host_name = "* * *"
                            ip_addr = ""
                            
                            # Get identifying info from first successful probe
                            for p in probes:
                                h = p.findtext('host-name')
                                i = p.findtext('ip-address')
                                if h or i:
                                    host_name = h.strip() if h else i.strip()
                                    ip_addr = i.strip() if i else host_name
                                    break
                            
                            if req.resolve_ptr and ip_addr and ip_addr != "* * *":
                                host_name = get_ptr_for_ip(ip_addr)
                                
                            asn_str = ""
                            if req.resolve_asn and ip_addr and ip_addr != "* * *":
                                asn_str = get_asn_from_cymru(ip_addr)
                                if asn_str:
                                    asn_str = f" {asn_str}"
                            
                            # Build the prefix: " 1  host.name (ip) [AS]" or just " 1  ip [AS]"
                            if host_name != ip_addr and ip_addr:
                                prefix = f"{ttl:>2}  {host_name} ({ip_addr}){asn_str}"
                            else:
                                prefix = f"{ttl:>2}  {host_name}{asn_str}"
                            
                            # Collect RTTs
                            rtt_values = []
                            for p in probes:
                                rtt_us = p.findtext('rtt')
                                if rtt_us:
                                    try:
                                        rtt_ms = float(rtt_us.strip()) / 1000.0
                                        rtt_values.append(f"{rtt_ms:.3f} ms")
                                    except ValueError:
                                        rtt_values.append(f"{rtt_us.strip()}")
                                elif p.find('probe-failure') is not None:
                                    rtt_values.append("*")
                                else:
                                    rtt_values.append("*")
                            
                            rtt_str = "  ".join(rtt_values)
                            lines.append(f"{prefix}  {rtt_str}")
                        else:
                            lines.append(f"{ttl:>2}  * * *")
                    
                    debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] ✓ Parsed {len(hops)} hops")
                
                result = "\n".join(lines)

            elif req.command == "show_bgp_neighbor":
                kwargs = {}
                if req.target:
                    kwargs["neighbor_address"] = req.target
                if req.logical_system and req.logical_system != "global":
                    kwargs["logical_system"] = req.logical_system
                    
                response = dev.rpc.get_bgp_neighbor_information(**kwargs)
                
                lines = []
                peers = response.xpath('.//bgp-peer')
                for peer in peers:
                    addr = peer.findtext('peer-address') or "?"
                    peer_as = peer.findtext('peer-as') or "?"
                    state = peer.findtext('peer-state') or "?"
                    desc = peer.findtext('description') or ""
                    uptime = peer.findtext('elapsed-time') or "?"
                    flaps = peer.findtext('flap-count') or "0"
                    local_addr = peer.findtext('local-address') or "?"
                    
                    lines.append(f"Peer: {addr}+179     AS {peer_as}     Local: {local_addr}+179")
                    if desc:
                        lines.append(f"  Description: {desc}")
                    lines.append(f"  Type: External    State: {state}    Flags: <{peer.findtext('peer-flags') or ''}>")
                    lines.append(f"  Last State: {peer.findtext('last-state') or '?'}    Last Event: {peer.findtext('last-event') or '?'}")
                    lines.append(f"  Uptime: {uptime}    Flap Count: {flaps}")
                    
                    # BGP RIB info
                    ribs = peer.xpath('.//bgp-rib')
                    for rib in ribs:
                        rib_name = rib.findtext('name') or ""
                        active = rib.findtext('active-prefix-count') or "0"
                        received = rib.findtext('received-prefix-count') or "0"
                        accepted = rib.findtext('accepted-prefix-count') or "0"
                        lines.append(f"  Table {rib_name}:")
                        lines.append(f"    Active prefixes: {active}   Received: {received}   Accepted: {accepted}")
                    lines.append("")
                
                result = "\n".join(lines) if lines else "No BGP neighbors found."
            
            elif req.command == "show_bgp_summary":
                kwargs = {}
                if req.logical_system and req.logical_system != "global":
                    kwargs["logical_system"] = req.logical_system
                    
                response = dev.rpc.get_bgp_summary_information(**kwargs)
                
                lines = []
                lines.append(f"{'Peer':<24} {'AS':>8} {'InPkt':>10} {'OutPkt':>10} {'State':>14} {'Active/Rcvd/Acc':>20}")
                lines.append("-" * 90)
                
                peers = response.xpath('.//bgp-peer')
                for peer in peers:
                    addr = peer.findtext('peer-address') or "?"
                    peer_as = peer.findtext('peer-as') or "?"
                    state = peer.findtext('peer-state') or "?"
                    in_msg = peer.findtext('input-messages') or "0"
                    out_msg = peer.findtext('output-messages') or "0"
                    active = peer.findtext('.//active-prefix-count') or "0"
                    received = peer.findtext('.//received-prefix-count') or "0"
                    accepted = peer.findtext('.//accepted-prefix-count') or "0"
                    
                    pfx_info = f"{active}/{received}/{accepted}"
                    lines.append(f"{addr:<24} {peer_as:>8} {in_msg:>10} {out_msg:>10} {state:>14} {pfx_info:>20}")
                
                result = "\n".join(lines)
            
            elif req.command == "show_interfaces":
                kwargs = {}
                if req.target:
                    kwargs["interface_name"] = req.target
                    
                response = dev.rpc.get_interface_information(terse=True, **kwargs)
                
                lines = []
                lines.append(f"{'Interface':<24} {'Admin':>8} {'Link':>8} {'Proto':>8} {'Local':>20}")
                lines.append("-" * 72)
                
                ifaces = response.xpath('.//physical-interface | .//logical-interface')
                for iface in ifaces:
                    name = iface.findtext('name') or "?"
                    admin = iface.findtext('admin-status') or ""
                    oper = iface.findtext('oper-status') or ""
                    
                    addr_families = iface.xpath('.//address-family')
                    if addr_families:
                        for af in addr_families:
                            proto = af.findtext('address-family-name') or ""
                            local = af.findtext('.//ifa-local') or ""
                            lines.append(f"{name:<24} {admin:>8} {oper:>8} {proto:>8} {local:>20}")
                    else:
                        lines.append(f"{name:<24} {admin:>8} {oper:>8}")
                
                result = "\n".join(lines)
            
            t_end = time.time()
            total_ms = (t_end - t_start) * 1000
            debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] ✓ Response parsed successfully")
            debug_log.append(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Total execution time: {total_ms:.0f}ms")
            
            return {
                "success": True, 
                "output": result, 
                "command": req.command, 
                "target": req.target,
                "debug": {
                    "logs": debug_log,
                    "execution_time_ms": round(total_ms),
                    "raw_xml_bytes": raw_xml_size,
                    "device_model": dev.facts.get('model', 'unknown'),
                    "device_hostname": dev.facts.get('hostname', 'unknown'),
                    "device_version": dev.facts.get('version', 'unknown'),
                    "timestamp": datetime.now().isoformat(),
                }
            }
    
    except Exception as e:
        return {"success": False, "error": str(e)}
