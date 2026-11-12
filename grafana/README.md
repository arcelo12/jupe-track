# JupeTrack Grafana Dashboards

Grafana dashboards for the metrics that the `backend-go` scraper pushes to
VictoriaMetrics (`http://victoriametrics:8428/api/v1/import/prometheus`) after
each scrape cycle, when data is available. VictoriaMetrics is
Prometheus-compatible, so the dashboards work with either the built-in
Prometheus datasource or the official VictoriaMetrics datasource plugin.

## Dashboard files

| File | Datasource reference | How to use |
|------|----------------------|------------|
| `jupetrack-historical-dashboard-universal.json` | none (panels inherit the dashboard default datasource) | Import via UI or copy into the provisioning folder. Best choice for provisioning. |
| `jupetrack-historical-dashboard-vmplugin.json` | `victoriametrics-datasource` (not the current plugin type) | Import via UI. The current VictoriaMetrics plugin uses the type `victoriametrics-metrics-datasource`; update the dashboard references if you install it. |
| `jupetrack-historical-dashboard-vm.json` | `victoriametrics` (non-standard type) | Import via UI only if a datasource of that type already exists; the current VictoriaMetrics plugin does not provide it. |
| `jupetrack-historical-dashboard.json` | `victoriametrics-datasource` (not the current plugin type) | Import via UI. Most complete dashboard (adds CPU, memory, RE temperature, uptime); update the type for the current plugin. |
| `provisioning/dashboards/jupetrack-dashboard.json` | `prometheus`, uid `victoriametrics` | Loaded automatically by `provisioning/dashboards/main.yml`. |

All dashboard files use the same UID (`jupetrack-historical`), so only one of
them can be active at a time. To switch, remove the provisioned JSON file
(Grafana removes its dashboard on the next scan) or give the copy a new UID.

Files that contain an `__inputs` block (`DS_VICTORIAMETRICS`) are meant for the
Grafana UI import dialog: select the datasource in the import form and Grafana
replaces `${DS_VICTORIAMETRICS}` for every panel.

## Quick start (Docker Compose)

`docker-compose.yml` in this repository already includes the `grafana` service
below. The snippet is also suitable for other deployments that only have the
`jupetrack`, `backend-go`, and `victoriametrics` services:

```yaml
services:
  grafana:
    image: grafana/grafana:latest
    container_name: jupetrack_grafana
    ports:
      - "127.0.0.1:3031:3000"   # 3000 and 3030 were already taken on this host
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=change-me
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - ./grafana/provisioning/datasources:/etc/grafana/provisioning/datasources
      - ./grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards
      - grafana-data:/var/lib/grafana
    depends_on:
      - victoriametrics
    restart: unless-stopped

volumes:
  grafana-data:
```

The provided `provisioning/datasources/victoriametrics.yml` registers a default
Prometheus-type datasource with UID `victoriametrics` and internal URL
`http://victoriametrics:8428`. The internal URL is required when Grafana runs in
the same Compose network; `http://localhost:8428` only works if Grafana runs
directly on the host.

`provisioning/dashboards/main.yml` points at
`/etc/grafana/provisioning/dashboards`, the folder mounted above. Provisioning
reloads changed dashboards every 30 seconds.

Then:

```bash
docker compose up -d grafana
```

Open `http://localhost:3031` and log in with the credentials from the service
environment. The port is bound to `127.0.0.1` so it is not exposed on the LAN;
change the mapping if you need remote access.

## Metrics stored in VictoriaMetrics

| Metric | Labels | Unit | Meaning |
|--------|--------|------|---------|
| `jupetrack_interface_bps_in` | `interface`, `description`, `if_index`, `type` (`physical`/`logical`) | bps | Current input rate |
| `jupetrack_interface_bps_out` | same as above | bps | Current output rate |
| `jupetrack_bgp_active_prefixes` | `peer`, `as` | count | Active prefixes per peer (Junos `active-prefix-count`, not `accepted-prefix-count`) |
| `jupetrack_bgp_received_prefixes` | `peer`, `as` | count | Received prefixes per peer |
| `jupetrack_device_cpu_usage` | `hw_model` | percent | Routing Engine CPU usage |
| `jupetrack_device_cpu_idle` | `hw_model` | percent | Routing Engine CPU idle |
| `jupetrack_device_memory_utilization` | `hw_model` | percent | Memory utilization |
| `jupetrack_device_re_temperature` | `hw_model` | celsius | Routing Engine temperature |
| `jupetrack_device_uptime_seconds` | `hw_model` | seconds | Device uptime |
| `jupetrack_firewall_counter_bytes_total` | `logical_system`, `filter`, `term` | bytes | Firewall term counter |
| `jupetrack_firewall_counter_packets_total` | `logical_system`, `filter`, `term` | packets | Firewall term counter |
| `jupetrack_firewall_policer_drop_bytes_total` | `logical_system`, `filter`, `policer` | bytes | Policer drops |
| `jupetrack_firewall_policer_drop_packets_total` | `logical_system`, `filter`, `policer` | packets | Policer drops |

Interface and BGP metrics are only pushed when the corresponding scraper
settings (`enable_interfaces`, `enable_bgp`) are on. Firewall metrics are only
pushed when `enable_firewall=1` and the main scrape produced data.

## Panels and queries

| Panel | Query |
|-------|-------|
| Total Ingress (Current) | `sum(jupetrack_interface_bps_in{type=~"$iface_type", interface=~"$interface"})` |
| Total Egress (Current) | `sum(jupetrack_interface_bps_out{type=~"$iface_type", interface=~"$interface"})` |
| Total Active Prefixes (BGP) | `sum(jupetrack_bgp_active_prefixes{peer=~"$peer", as=~"$as"})` |
| Total Received Prefixes (BGP) | `sum(jupetrack_bgp_received_prefixes{peer=~"$peer", as=~"$as"})` |
| Traffic Throughput (In/Out) | `jupetrack_interface_bps_in{...}` / `jupetrack_interface_bps_out{...}` |
| BGP Prefix Count (Active vs Received) | `jupetrack_bgp_active_prefixes{...}` / `jupetrack_bgp_received_prefixes{...}` |
| CPU / Memory / RE Temperature / Uptime | `jupetrack_device_*` (full dashboard only) |

Dashboard variables:

- `$iface_type` - `physical` or `logical`
- `$interface` - interface or logical unit name
- `$as` - peer AS number
- `$peer` - peer IP address

Default refresh is `30s` and the default time range is the last 24 hours.

## Verify the data pipeline

```bash
# VictoriaMetrics is healthy
curl -fsS http://127.0.0.1:8428/health

# Are JupeTrack metrics present?
curl -s http://127.0.0.1:8428/api/v1/label/__name__/values \
  | tr ',' '\n' | grep jupetrack

# Current value of one metric
curl -s --data-urlencode 'query=jupetrack_device_cpu_usage' \
  http://127.0.0.1:8428/api/v1/query

# Total ingress across all interfaces
curl -s --data-urlencode 'query=sum(jupetrack_interface_bps_in)' \
  http://127.0.0.1:8428/api/v1/query
```

## Notes

- Retention is a VictoriaMetrics setting (`-retentionPeriod=1y` in
  `docker-compose.yml`); there is no retention metric.
- These dashboards read VictoriaMetrics. The Go backend's own `/metrics`
  endpoint separately exposes operational metrics
  (`jupetrack_scraper_scrape_duration_seconds`,
  `jupetrack_scraper_scrape_total`, `jupetrack_bgp_peer_count`,
  `jupetrack_interfaces_count`, plus API/cache/database/system metrics). Those
  are not pushed to VictoriaMetrics and are not used by these dashboards.
- `jupetrack_interface_bps_*` values come from Junos `input-bps`/`output-bps`
  and are already bits per second; do not multiply by 8.
- The datasource provisioning file intentionally uses the built-in `prometheus`
  type so no Grafana plugin install is needed. If you prefer the official
  VictoriaMetrics plugin, install `victoriametrics-metrics-datasource` and set
  `type: victoriametrics-metrics-datasource`. The `-vmplugin` and full
  dashboards in this folder still reference the non-current
  `victoriametrics-datasource` type, so update those references (or start from
  the `universal` dashboard).
- Change the default Grafana admin password before exposing port 3031 beyond
  localhost.
