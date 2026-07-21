# Dokumentasi API JupeTrack

JupeTrack adalah dashboard monitoring untuk router edge Juniper MX204. Backend Go
mengumpulkan data BGP, interface, dan status perangkat melalui NETCONF (SSH),
menyimpan metrik time-series di VictoriaMetrics, dan menyajikan REST API +
WebSocket untuk frontend.

- Versi API: `v1`
- Backend: Go (Gin) — lihat `backend-go/`
- Format respons: JSON
- Semua path di dokumen ini relatif terhadap Base URL di bawah.

## Base URL

```
http://<host>:8085/api/v1
```

Kontainer backend listen di port `8080`; host memetakan ke `8085`
(lihat `docker-compose.yml`). Frontend Next.js (`:3040`) mem-proxy request REST
melalui route handler internalnya, jadi browser tidak memanggil backend langsung —
kecuali WebSocket.

### Health check (publik)

```
GET /health
```

Tidak memerlukan autentikasi. Respons:

```json
{"status": "ok"}
```

> Catatan: `/health` berada di root server (bukan di bawah `/api/v1`).

---

## Autentikasi

API mendukung **dua metode autentikasi**. Sebagian besar endpoint menerima
keduanya; endpoint admin hanya menerima JWT dari user admin.

### 1. JWT Bearer (user login)

Alur:

1. `POST /auth/login` dengan `{username, password}`.
2. Respons berisi `access_token` (umur default 60 menit, dapat diatur via env
   `ACCESS_TOKEN_EXPIRE_MINUTES`) dan `refresh_token` (default 7 hari, env
   `REFRESH_TOKEN_EXPIRE_DAYS`).
3. Kirim access token di header setiap request:

```
Authorization: Bearer <access_token>
```

4. Saat access token kedaluwarsa, tukar refresh token melalui `POST /auth/refresh`
   untuk mendapatkan access token baru.

Klaim JWT: `sub` (username), `exp`, `is_admin`, `type` (`access` atau `refresh`).

### 2. API Key (mesin/integrasi)

API key dibuat oleh admin dan dikirim lewat header:

```
X-API-Key: jpt_<40 karakter hex>
```

Key hanya ditampilkan **sekali** saat dibuat — simpan baik-baik. Setiap key
memiliki daftar scope; request ke endpoint yang scope-nya tidak dimiliki key
akan ditolak dengan `403`.

### Tabel Scope

| Scope                | Memberi akses ke |
|----------------------|------------------|
| `read:bgp`           | `/logical-systems`, `/bgp-summary/*`, `/bgp-policy/*`, `/bgp-logs/*`, `/live/bgp`, `/as-mapping` (GET) |
| `read:interfaces`    | `/interfaces/traffic/*`, `/live/interfaces` |
| `read:metrics`       | `/metrics/status`, `/metrics/interfaces/*`, `/metrics/bgp/peers` |
| `read:device`        | `/metrics/device/status` |
| `read:lookup`        | `/lookup/asn/*`, `/lookup/ip/*`, `/lookup/community/*` |
| `read:*`             | **Wildcard** — mencakup semua scope `read:*` di atas (tidak termasuk `exec:*`) |
| `exec:looking-glass` | `POST /looking-glass` |

Endpoint admin (`/api-keys`, `PUT /metrics/retention`, `/settings/device`,
`/diagnose`, dll.) **tidak** bisa diakses dengan API key — hanya JWT admin.

---

## Rate Limiting

- **Login**: maksimal 5 percobaan gagal per IP dalam 5 menit. Setelah itu IP
  dikunci 5 menit dan menerima `429`.
- **Global**: 300 request/menit per IP (burst 60) untuk semua endpoint. Identitas
  klien memakai nama API key bila ada, jika tidak memakai IP. Jika terlampaui,
  server merespons `429 Too Many Requests` disertai header `Retry-After` (detik).

## CORS

CORS diaktifkan global. Origin yang diizinkan dikontrol lewat env
`ALLOWED_ORIGINS` (dipisah koma). Kosong atau `*` = izinkan semua origin.
Preflight `OPTIONS` dijawab `204`. Header yang diizinkan: `Authorization`,
`X-API-Key`, `Content-Type`.

## Format Error

Semua error menggunakan format seragam:

```json
{"error": "<pesan error>"}
```

| Kode | Arti |
|------|------|
| 400  | Request tidak valid (payload/parameter salah) |
| 401  | Token/key tidak ada, tidak valid, atau kedaluwarsa |
| 403  | Autentikasi OK, tetapi scope/hak akses kurang (mis. butuh admin) |
| 404  | Resource tidak ditemukan |
| 429  | Rate limit terlampaui (lihat `Retry-After`) |
| 500  | Error internal server / perangkat tidak terjangkau |

> Pengecualian: beberapa endpoint (looking-glass, lookup) menyertakan field
> tambahan `"success": false` di samping `"error"`.

---

## Referensi Endpoint

Semua contoh menggunakan variabel:

```bash
export JUPETRACK="http://localhost:8085/api/v1"
export TOKEN="<access_token>"
# atau
export API_KEY="jpt_xxxxxxxx..."
```

Header autentikasi (pilih salah satu):

```bash
-H "Authorization: Bearer $TOKEN"
-H "X-API-Key: $API_KEY"
```

### Autentikasi

#### `POST /auth/login`

Login user, mengembalikan token pair. **Publik** (rate-limited).

Request:

```json
{
  "username": "admin",
  "password": "rahasia"
}
```

Respons `200`:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

Error: `400` payload salah, `401` kredensial salah, `429` lockout.

```bash
curl -s -X POST "$JUPETRACK/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"rahasia"}'
```

#### `POST /auth/refresh`

Tukar refresh token dengan access token baru. **Publik**.

Request:

```json
{"refresh_token": "eyJhbGciOiJIUzI1NiIs..."}
```

Respons `200`: sama seperti login (field `access_token`, `refresh_token`,
`token_type`, `expires_in`). Refresh token yang dipakai tetap berlaku
(dikembalikan apa adanya).

Error: `401` token tidak valid / bukan refresh token.

#### `GET /auth/me`

Profil user yang sedang login. **JWT**.

Respons `200`:

```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "is_active": true,
  "is_admin": true,
  "created_at": "2026-01-10T08:00:00Z",
  "last_login": "2026-07-21T03:12:44Z"
}
```

#### `POST /auth/change-password`

Ganti password user yang sedang login. **JWT**.

Request:

```json
{
  "current_password": "lama",
  "new_password": "baru"
}
```

Respons `200`:

```json
{"success": true, "message": "Password updated successfully"}
```

Error: `401` password lama salah.

---

### BGP

#### `GET /logical-systems`

Daftar logical system di perangkat. Selalu menyertakan `"global"`.

**Auth**: JWT atau API key scope `read:bgp`.

Respons `200`:

```json
["global", "LS-CUSTOMER-A", "LS-CUSTOMER-B"]
```

```bash
curl -s "$JUPETRACK/logical-systems" -H "X-API-Key: $API_KEY"
```

#### `GET /bgp-summary/:logical_system`

Daftar BGP peer dari cache in-memory (diisi scraper tiap interval).
Gunakan `global` untuk routing instance utama.

**Auth**: JWT atau API key scope `read:bgp`.

Respons `200` — array `BGPPeer`:

```json
[
  {
    "peer_address": "103.147.8.9",
    "peer_as": "AS7713",
    "state": "Established",
    "description": "Transit - Telkom",
    "uptime": "12w3d 04:15:22",
    "active_prefixes": 812340,
    "received_prefixes": 890112,
    "accepted_prefixes": 845021,
    "advertised_prefixes": 35,
    "afi": "inet.0",
    "router_id": "10.0.255.1"
  }
]
```

Error: `400` parameter logical system tidak valid.

#### `GET /bgp-policy/:logical_system`

Routing policy (import/export) per neighbor, beserta detail term policy.

**Auth**: JWT atau API key scope `read:bgp`.

Respons `200`:

```json
{
  "neighbors": [
    {
      "neighbor": "103.147.8.9",
      "import_policies": ["FROM-TRANSIT"],
      "export_policies": ["TO-TRANSIT"],
      "policy_details": {
        "FROM-TRANSIT": {
          "policy_name": "FROM-TRANSIT",
          "terms": [
            {
              "term_name": "10",
              "from_conditions": ["protocol bgp", "community CUSTOMER"],
              "then_actions": ["local-preference 200", "accept"]
            }
          ]
        }
      }
    }
  ],
  "policies": {
    "FROM-TRANSIT": {
      "policy_name": "FROM-TRANSIT",
      "terms": [
        {
          "term_name": "10",
          "from_conditions": ["protocol bgp"],
          "then_actions": ["accept"]
        }
      ]
    }
  }
}
```

#### `GET /bgp-logs/:logical_system/:peer`

50 baris log terakhir dari `show log messages` yang cocok dengan alamat peer.

**Auth**: JWT atau API key scope `read:bgp`.

Respons `200` — array string:

```json
[
  "Jul 21 03:01:12 mx204 rpd[1234]: bgp_peer_mgmt_clear: ...",
  "Jul 21 03:01:14 mx204 rpd[1234]: BGP_PEER_UP: ..."
]
```

Error: `400` parameter peer tidak valid.

---

### Interface

#### `GET /interfaces/traffic/:logical_system`

Statistik trafik semua interface fisik (`ge`/`et`/`xe`) + unit logisnya,
dari cache in-memory. Parameter `:logical_system` saat ini tidak memfilter
(cache bersifat global).

**Auth**: JWT atau API key scope `read:interfaces`.

Respons `200` — array `InterfaceStat`:

```json
[
  {
    "name": "et-0/0/0",
    "description": "Uplink Transit",
    "type": "physical",
    "admin_status": "up",
    "oper_status": "up",
    "bps_in": 4123456789,
    "bps_out": 2987654321
  }
]
```

---

### Live (cache instan)

Endpoint ini membaca langsung dari cache in-memory — respons cepat, data
semuda siklus scrape terakhir.

#### `GET /live/bgp?logical_system=`

**Auth**: JWT atau API key scope `read:bgp`.

| Query param       | Default  | Keterangan |
|-------------------|----------|------------|
| `logical_system`  | `global` | Logical system yang peers-nya diambil |

Respons `200`: array `BGPPeer` (sama seperti `/bgp-summary/:logical_system`).

```bash
curl -s "$JUPETRACK/live/bgp?logical_system=global" -H "X-API-Key: $API_KEY"
```

#### `GET /live/interfaces`

**Auth**: JWT atau API key scope `read:interfaces`.

Respons `200`: array `InterfaceStat` (sama seperti `/interfaces/traffic/...`).

---

### Metrik & Status Perangkat

#### `GET /metrics/status`

Status scheduler/scraper.

**Auth**: JWT atau API key scope `read:metrics`.

Respons `200`:

```json
{
  "enabled": true,
  "last_scrape_interface": "2026-07-21T03:10:00Z",
  "last_scrape_bgp": "2026-07-21T03:10:02Z",
  "next_run": null,
  "total_interface_records": 152340,
  "total_bgp_records": 91230
}
```

#### `GET /metrics/interfaces/names`

Daftar nama interface fisik yang tersedia (untuk filter history).

**Auth**: JWT atau API key scope `read:metrics`.

Respons `200`:

```json
["et-0/0/0", "et-0/0/1", "ge-0/1/0"]
```

#### `GET /metrics/bgp/peers`

Daftar alamat peer BGP unik di semua logical system aktif.

**Auth**: JWT atau API key scope `read:metrics`.

Respons `200`:

```json
["103.147.8.9", "2001:db8::1"]
```

#### `GET /metrics/device/status`

Status perangkat (CPU, memori, suhu, uptime) dari cache.

**Auth**: JWT atau API key scope `read:device`.

Respons `200` — `DeviceStatus`:

```json
{
  "cpu_usage": 12.5,
  "cpu_idle": 87.5,
  "memory_utilization": 41.2,
  "re_temperature": 47.0,
  "uptime_seconds": 7342210,
  "hw_model": "MX204"
}
```

Jika cache belum terisi, server mengembalikan nilai nol dengan
`"hw_model": "MX204"`.

#### `GET /metrics/interfaces/history`

Deret waktu bps in/out per interface, diproxy dari VictoriaMetrics.

**Auth**: JWT atau API key scope `read:metrics`.

| Query param      | Default | Keterangan |
|------------------|---------|------------|
| `hours`          | `24`    | Rentang mundur dari sekarang. Nilai umum: `1`, `6`, `24`, `48`, `168` |
| `interface_name` | kosong  | Filter satu interface (harus nama valid; lihat `/metrics/interfaces/names`) |
| `start`          | —       | RFC3339, mis. `2026-07-20T00:00:00Z`. Harus dipasangkan dengan `end` |
| `end`            | —       | RFC3339. Jika `start`/`end` diisi, `hours` diabaikan |

Respons `200`:

```json
[
  {
    "interface_name": "et-0/0/0",
    "interface_type": "physical",
    "points": [
      {
        "timestamp": "2026-07-20T03:00:00Z",
        "bps_in": 4100000000,
        "bps_out": 2950000000
      }
    ]
  }
]
```

Error: `400` `interface_name` tidak dikenal.

```bash
curl -s "$JUPETRACK/metrics/interfaces/history?hours=6&interface_name=et-0/0/0" \
  -H "X-API-Key: $API_KEY"
```

---

### AS Mapping

#### `GET /as-mapping`

Seluruh pemetaan ASN → nama/tipe (Transit, IX, Customer, Peer, ...).

**Auth**: JWT atau API key scope `read:bgp`.

Respons `200` — array `ASMapping`:

```json
[
  {
    "asn": "7713",
    "name": "Telkom Indonesia",
    "type": "Transit",
    "created_at": "2026-01-10T08:00:00Z",
    "updated_at": "2026-01-10T08:00:00Z"
  }
]
```

---

### Lookup Eksternal (RIPEstat)

Diproxy ke RIPEstat (`stat.ripe.net`) dengan cache 24 jam sisi server.

#### `GET /lookup/asn/:asn`

Overview sebuah ASN. Prefiks `AS` opsional (`AS7713` atau `7713` sama saja).

**Auth**: JWT atau API key scope `read:lookup`.

Respons `200` (diteruskan dari RIPEstat):

```json
{
  "status": "ok",
  "data": {
    "resource": "7713",
    "holder": "TELKOMNET-AS-AP PT Telekomunikasi Indonesia",
    "announced": true
  }
}
```

#### `GET /lookup/ip/:ip`

Network-info (prefix asal) sebuah alamat IP.

**Auth**: JWT atau API key scope `read:lookup`.

Respons `200`:

```json
{
  "status": "ok",
  "data": {
    "resource": "103.147.8.9",
    "prefix": "103.147.8.0/24",
    "asns": ["7713"]
  }
}
```

#### `GET /lookup/community/:community`

Konteks ASN untuk BGP community format `AS:VAL` (mis. `2914:420`).

**Auth**: JWT atau API key scope `read:lookup`.

Respons `200`:

```json
{
  "success": true,
  "community": "2914:420",
  "asn_context": { "status": "ok", "data": { "...": "..." } },
  "note": "Community values are ASN-specific. Review the ASN owner's routing policy."
}
```

Error: `400` format community bukan `AS:VAL`.

---

### Looking Glass

#### `POST /looking-glass`

Jalankan perintah diagnostik di router melalui NETCONF. Semua input
di-sanitize sebelum disusun menjadi RPC/CLI.

**Auth**: JWT atau API key scope `exec:looking-glass`.

Request body:

| Field            | Tipe   | Wajib | Keterangan |
|------------------|--------|-------|------------|
| `command`        | string | ya    | Salah satu: `show_route`, `ping`, `traceroute`, `show_bgp_neighbor`, `show_bgp_summary`, `show_interfaces`, `route_lookup` |
| `target`         | string | lihat cmd | Tujuan: IP/prefix/interface/neighbor. Wajib untuk `ping`, `traceroute` |
| `source_address` | string | tidak | Source address untuk `ping`/`traceroute` |
| `logical_system` | string | tidak | Default `global` |
| `resolve_ptr`    | bool   | tidak | Minta frontend resolve PTR |
| `resolve_asn`    | bool   | tidak | Minta frontend resolve ASN |
| `protocol`       | string | tidak | (`route_lookup`) Filter protocol, mis. `bgp`, `ospf`; `all` = tanpa filter |
| `detail_level`   | string | tidak | (`route_lookup`) `brief`, `detail`, `extensive` |
| `bgp_mode`       | string | tidak | (`route_lookup`) `advertising` atau `receive` — pakai `neighbor_ip` |
| `neighbor_ip`    | string | tidak | (`route_lookup`) Wajib bila `bgp_mode` diisi |

Contoh request:

```json
{
  "command": "ping",
  "target": "103.147.8.9",
  "logical_system": "global"
}
```

Contoh route lookup mode BGP advertising:

```json
{
  "command": "route_lookup",
  "bgp_mode": "advertising",
  "neighbor_ip": "103.147.8.9",
  "target": "103.147.8.0/24"
}
```

Respons `200`:

```json
{
  "success": true,
  "output": "PING 103.147.8.9 (103.147.8.9)\n\n--- ping statistics ---\n5 packets transmitted, 5 received, 0% packet loss\nrtt min/avg/max = 0.412/0.520/0.688 ms",
  "command": "ping",
  "target": "103.147.8.9"
}
```

Untuk user **admin JWT**, respons menyertakan blok tambahan:

```json
{
  "success": true,
  "output": "...",
  "command": "ping",
  "target": "103.147.8.9",
  "debug": {
    "logs": ["[03:12:01.001] Request received: ping", "..."],
    "execution_time_ms": 812,
    "raw_xml_bytes": 1402,
    "raw_xml": "<rpc-reply>...</rpc-reply>"
  }
}
```

Error: `400` (`{"success": false, "error": "..."}`) bila payload/command
tidak valid; `500` bila RPC ke perangkat gagal.

```bash
curl -s -X POST "$JUPETRACK/looking-glass" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"show_bgp_summary","logical_system":"global"}'
```

---

## WebSocket

```
GET /ws?token=<JWT>&logical_system=<name>
```

WebSocket adalah satu-satunya kanal yang diakses browser langsung (tanpa proxy
Next.js). Autentikasi lewat query param `token` (JWT access token) — API key
**tidak** didukung di WebSocket.

| Query param      | Default  | Keterangan |
|------------------|----------|------------|
| `token`          | —        | Wajib. JWT access token |
| `logical_system` | `global` | Filter pesan `bgp_summary` per logical system |

Begitu terhubung, server langsung mengirim snapshot cache, lalu update setiap
kali scraper selesai satu siklus. Server mengirim WebSocket ping tiap 30 detik.

Format pesan (JSON text frame):

```json
{
  "type": "bgp_summary",
  "data": [ { "peer_address": "103.147.8.9", "state": "Established", "...": "..." } ]
}
```

```json
{
  "type": "interfaces",
  "data": [ { "name": "et-0/0/0", "bps_in": 4123456789, "...": "..." } ]
}
```

| `type`        | Isi `data` |
|---------------|------------|
| `bgp_summary` | Array `BGPPeer` untuk logical system koneksi ini |
| `interfaces`  | Array `InterfaceStat` (semua client) |

Error handshake: `401` bila `token` hilang/tidak valid.

---

## Endpoint Admin

Semua endpoint berikut memerlukan **JWT user admin** (`is_admin=true`).
API key tidak berlaku, kecuali bila dinyatakan lain.

| Method | Path                   | Fungsi |
|--------|------------------------|--------|
| POST   | `/api-keys`            | Buat API key baru. Body: `{"name", "scopes": [...]}`. Respons berisi key plaintext (`jpt_...`) **hanya sekali** |
| GET    | `/api-keys`            | Daftar API key (tanpa secret) |
| PATCH  | `/api-keys/:id`        | Ubah nama/scopes/status aktif key |
| DELETE | `/api-keys/:id`        | Hapus (revoke) key |
| PUT    | `/metrics/retention`   | Simpan pengaturan retensi + interval scrape. Body: `retention_days_interface`, `retention_days_bgp`, `scrape_interval_seconds`, `scrape_enabled`, `enable_bgp`, `enable_interfaces`, `scrape_interface_targets`, `scrape_bgp_targets` |
| GET    | `/ws/settings`         | Baca pengaturan scraper (semua user terautentikasi) |
| POST   | `/ws/settings`         | Ubah `enable_bgp`, `enable_interfaces`, `scrape_interval` (nanodetik), `background_scrape` |
| GET    | `/settings/device`     | Baca konfigurasi perangkat (password di-mask `********`). Semua user terautentikasi |
| POST   | `/settings/device`     | Simpan host/user/port/password NETCONF perangkat |
| POST   | `/as-mapping`          | Upsert AS mapping. Body: `{"asn", "name", "type"}` |
| DELETE | `/as-mapping/:asn`     | Hapus AS mapping |
| POST   | `/live/refresh`        | Picu scrape manual segera |
| GET    | `/diagnose`            | Uji konektivitas NETCONF + CLI ke perangkat |
| GET    | `/test-bgp`            | Dump raw XML `get-bgp-summary-information` |
| GET    | `/test-iface`          | Fetch interface langsung (bypass cache) |

Alternatif tanpa JWT — CLI `apikey` di dalam container backend (akses DB
langsung, berguna saat password admin hilang):

```bash
docker exec jupetrack_go /app/apikey create --name grafana --scopes read:metrics,read:device
docker exec jupetrack_go /app/apikey list
docker exec jupetrack_go /app/apikey update --id 3 --scopes 'read:*,exec:looking-glass'
docker exec jupetrack_go /app/apikey update --id 3 --deactivate
docker exec jupetrack_go /app/apikey revoke --id 3
```

Contoh membuat API key via HTTP:

```bash
curl -s -X POST "$JUPETRACK/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"grafana","scopes":["read:metrics","read:device"]}'
```

Contoh update retensi:

```bash
curl -s -X PUT "$JUPETRACK/metrics/retention" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "retention_days_interface": 30,
    "retention_days_bgp": 90,
    "scrape_interval_seconds": 30,
    "scrape_enabled": true,
    "enable_bgp": true,
    "enable_interfaces": true,
    "scrape_interface_targets": "",
    "scrape_bgp_targets": ""
  }'
```

---

## Changelog

| Versi | Tanggal    | Perubahan |
|-------|------------|-----------|
| 1.1.0 | 2026-07-21 | Autentikasi API key (`X-API-Key`) + scope; rate limit API key dengan `Retry-After` |
| 1.0.0 | 2026-01-01 | Rilis awal: JWT auth, BGP/interface/live/metrics, looking glass, WebSocket |
