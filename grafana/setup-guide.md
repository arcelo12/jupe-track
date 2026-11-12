# Grafana + VictoriaMetrics Setup Guide

This guide covers connecting Grafana to the VictoriaMetrics instance that
JupeTrack already runs, and loading the historical dashboards. For the metric
and panel reference, see [README.md](./README.md).

## 1. Datasource

### Option A - Provisioning (recommended)

`provisioning/datasources/victoriametrics.yml` registers a datasource that
works without installing any Grafana plugin:

```yaml
apiVersion: 1

datasources:
  - name: VictoriaMetrics
    uid: victoriametrics
    type: prometheus          # VictoriaMetrics is Prometheus-compatible
    access: proxy
    url: http://victoriametrics:8428
    isDefault: true
    editable: true
    jsonData:
      timeInterval: "30s"
      httpMethod: POST
```

Important details:

- `url` must be the Compose service name (`http://victoriametrics:8428`),
  not `http://localhost:8428`. `localhost` inside the Grafana container refers
  to the Grafana container itself.
- `uid: victoriametrics` is what the provisioned dashboard
  (`provisioning/dashboards/jupetrack-dashboard.json`) references. If you change
  the UID, update the dashboard datasource references too.
- `timeInterval: "30s"` matches the default scraper interval
  (`ScrapeInterval`, 30s). Adjust it if you change the scrape interval.
- `type: prometheus` needs no plugin. If you want the official VictoriaMetrics
  plugin instead, install `victoriametrics-metrics-datasource` and use
  `type: victoriametrics-metrics-datasource`. The bundled `-vmplugin` and full
  dashboards reference the non-current `victoriametrics-datasource` type, so
  update those datasource references (or use the `universal` dashboard).

Compose service (already present in this repository's `docker-compose.yml`):

```yaml
services:
  grafana:
    image: grafana/grafana:latest
    container_name: jupetrack_grafana
    ports:
      - "127.0.0.1:3031:3000"   # 3000 and 3030 were already in use on this host
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

Both `victoriametrics` (service name) and `jupetrack_victoriametrics`
(`container_name`) resolve inside the Compose network. Using the service name is
safer because it survives `container_name` changes.

### Option B - Manual datasource creation

1. **Grafana -> Connections -> Data sources -> Add data source**
2. Choose **Prometheus** (or **VictoriaMetrics** if the plugin is installed).
3. URL: `http://victoriametrics:8428` if Grafana runs in the same Docker
   network, otherwise `http://<host>:8428`.
4. Name: `VictoriaMetrics`
5. **Save & test**

### Verify the datasource

Use **Save & test** in the datasource settings; Grafana performs the request from
inside its own container, which also proves that the Compose hostname resolves.

```bash
# From the host, executed inside the Grafana container
docker exec jupetrack_grafana wget -qO- http://victoriametrics:8428/health
```

From the host:

```bash
curl -fsS http://127.0.0.1:8428/health
curl -s http://127.0.0.1:8428/api/v1/label/__name__/values \
  | tr ',' '\n' | grep jupetrack
```

## 2. Load a dashboard

### Option A - Provisioning

`provisioning/dashboards/main.yml` already points the provider at the mounted
folder:

```yaml
apiVersion: 1

providers:
  - name: 'JupeTrack Dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

`provisioning/dashboards/jupetrack-dashboard.json` has its datasource
references hard-coded to UID `victoriametrics`, so it loads without any UI
interaction. Restart Grafana, then open
`http://localhost:3031/d/jupetrack-historical`.

If you prefer the `universal` dashboard (it also inherits the default
datasource), copy that file into the provisioning folder, but first remove the
existing provisioned JSON file or give the copy a new UID. All dashboards in
this folder share the UID `jupetrack-historical`, and Grafana keeps only one
dashboard per UID.

Verify the provisioned state without opening the UI (replace `<password>` with
`GF_SECURITY_ADMIN_PASSWORD`):

```bash
# Grafana is up
curl -fsS http://127.0.0.1:3031/api/health

# Datasource exists and can reach VictoriaMetrics
curl -s -u 'admin:<password>' \
  http://127.0.0.1:3031/api/datasources/uid/victoriametrics/health

# Dashboard was provisioned
curl -s -u 'admin:<password>' 'http://127.0.0.1:3031/api/search?query=JupeTrack'

# A panel query executing through Grafana
curl -s -u 'admin:<password>' --get \
  --data-urlencode 'query=sum(jupetrack_interface_bps_in)' \
  http://127.0.0.1:3031/api/datasources/proxy/uid/victoriametrics/api/v1/query
```

### Option B - Import via UI

1. Open **Dashboards -> New -> Import**.
2. Upload or paste one of the dashboard JSON files.
3. If the file has an `__inputs` block, Grafana shows a **VictoriaMetrics**
   datasource dropdown. Select your datasource there. This replaces
   `${DS_VICTORIAMETRICS}` in every panel and variable.
4. Click **Import**.

| File | Datasource selection |
|------|----------------------|
| `jupetrack-historical-dashboard-universal.json` | No dropdown; uses the default datasource |
| `jupetrack-historical-dashboard-vmplugin.json` | References `victoriametrics-datasource`; current plugin type is `victoriametrics-metrics-datasource` |
| `jupetrack-historical-dashboard-vm.json` | References non-standard type `victoriametrics` (not provided by the current plugin) |
| `jupetrack-historical-dashboard.json` | References `victoriametrics-datasource`; full device panels |

Use `jupetrack-historical-dashboard-universal.json` if you use the built-in
Prometheus datasource from Option A; it has no hard-coded datasource references.

## 3. Dashboard reference

### Traffic

```promql
# Current rates (Junos traffic statistics, already in bits per second)
jupetrack_interface_bps_in{type=~"$iface_type", interface=~"$interface"}
jupetrack_interface_bps_out{type=~"$iface_type", interface=~"$interface"}

# Total across selected interfaces
sum(jupetrack_interface_bps_in{type=~"$iface_type", interface=~"$interface"})
```

### BGP prefixes

```promql
jupetrack_bgp_active_prefixes{peer=~"$peer", as=~"$as"}
jupetrack_bgp_received_prefixes{peer=~"$peer", as=~"$as"}
```

### Device health (full dashboard only)

```promql
jupetrack_device_cpu_usage
jupetrack_device_memory_utilization
jupetrack_device_re_temperature
jupetrack_device_uptime_seconds
```

### Firewall (not part of the default dashboards)

```promql
jupetrack_firewall_counter_packets_total{logical_system="$ls", filter="$filter", term="$term"}
jupetrack_firewall_policer_drop_packets_total{logical_system="$ls", filter="$filter", policer="$policer"}
```

These examples assume dashboard variables `$ls`, `$filter`, `$term`, and
`$policer`; replace them with literal values if you do not define those
variables. Actual label values look like `logical_system="global"`,
`filter="__EXCH/LIMIT-1G-IN"`, and `term="NARA-UP"`.

None of `jupe_track_*`, `*_rx_bytes`, `*_retention_days_*`,
`*_bgp_peers_established`, `*_router_packets_*`, or `*_network_latency_*`
exist in VictoriaMetrics. The complete list of metrics stored in VictoriaMetrics
is in [README.md](./README.md).

The Go backend also serves operational metrics on its own `/metrics` endpoint
(for example `jupetrack_scraper_scrape_duration_seconds`,
`jupetrack_scraper_scrape_total`, `jupetrack_bgp_peer_count`,
`jupetrack_interfaces_count`). Those are not scraped into VictoriaMetrics and
are not queried by these dashboards.

## 4. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Panels show "No data" | Confirm metrics exist: `curl -s http://127.0.0.1:8428/api/v1/label/__name__/values \| grep jupetrack`. If empty, the scraper is not pushing. |
| Metrics exist but a panel is empty | Check the dashboard time range (default 24h), the `$interface` / `$peer` filters, and that `enable_bgp=1` / `enable_interfaces=1` in `scraper_settings`. |
| "Datasource not found" or literal `${DS_VICTORIAMETRICS}` in a provisioned dashboard | Provisioning does not process `__inputs`. Use a dashboard with hard-coded UID (`jupetrack-dashboard.json`) or set the datasource UID to `victoriametrics`. |
| Import form has no datasource dropdown | That JSON has no `__inputs` (e.g. the `universal` file). Grafana uses the default datasource instead. |
| "Plugin not found: victoriametrics-datasource" | The dashboards reference a datasource type that does not match the current plugin. Install the current plugin (`GF_INSTALL_PLUGINS=victoriametrics-metrics-datasource`) and update the datasource references, or use the Prometheus-type datasource and the `universal` dashboard. |
| Datasource test fails with connection refused | Inside Docker use `http://victoriametrics:8428`, not `http://localhost:8428`. |
| Cannot start Grafana: port already allocated | The host's ports 3000 and 3030 are taken. Publish another free port (this repo uses `127.0.0.1:3031:3000`) and open that port. |
| Imported dashboard replaces the provisioned one | Both use UID `jupetrack-historical`. Give the imported copy a new UID before importing. |

## 5. Notes

- Grafana refreshes provisioned dashboards every 30 seconds; the dashboards
  themselves auto-refresh every 30 seconds and default to the last 24 hours.
- Retention is configured on VictoriaMetrics
  (`-retentionPeriod=1y` in `docker-compose.yml`), not in JupeTrack or Grafana.
- Grafana only depends on `victoriametrics`; the `jupetrack` and `backend-go`
  services are not required for Grafana to start.
