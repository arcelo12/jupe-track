# FEATURE SPEC & CONTEXT: Juniper MX204 Firewall Filter & Policer Monitoring in JupeTrack

## 1. Background & Problem Statement
Di lingkungan IXP Fabric / Shared Multi-Access VLAN (seperti JKT-IX, DE-CIX, ODIX), beberapa downstream customer atau BGP peers (misal AS151583 - SGM, AS153060 - Nara) berbagi satu interface fisik atau sub-interface logical yang sama (`et-0/0/1 unit X`). 
NMS tradisional dan scraper interface biasa (`get-interface-information`) hanya bisa membaca total agregat traffic port/unit, sehingga buta terhadap utilisasi per-customer.

Untuk mengisolasi dan me-limit bandwidth per-peer, Juniper MX204 menggunakan **Firewall Filters & Policers** dengan `counter` dan `policer` per-term. Saat ini, JupeTrack belum mengekstrak dan memvisualisasikan metrik firewall ini ke dalam dashboard.

## 2. Objective
Menambahkan modul **Firewall Filter & Policer Analytics** ke JupeTrack (`arcelo12/jupe-track`):
1. Mengikis (*scrape*) data firewall filter, counter, dan policer secara berkala via NETCONF/Junos RPC.
2. Menyimpan time-series metrik throughput (bytes/packets) dan drop status ke **VictoriaMetrics**.
3. Menyediakan REST API backend di Go untuk querying filter aktif dan utilisasi traffic (Mbps/pps).
4. Menyediakan UI interaktif di **Next.js 16** (Recharts + TailwindCSS) untuk memantau live throughput customer, kuota limiter, dan drop alert saat customer over-limit.

---

## 3. Technical Specifications

### A. Backend Scraper & Data Ingestion (Go / `backend-go`)
1. **NETCONF RPC / Operational Command:**
   - Eksekusi RPC Junos: `<get-firewall-filter-information>` atau perintah CLI operational via Junos client:
     - `show firewall filter <name>` (mendukung multi-logical-system, misal `logical-system EXCH`).
   - Ekstraksi XML / Structured Data:
     - `filter-name` (e.g., `LIMIT-1G-IN`, `LIMIT-1G-OUT`, atau prefix `__EXCH/...`)
     - `counter` entries: `counter-name` (e.g., `NARA-DOWN`, `SGM-DOWN`), `byte-count`, `packet-count`
     - `policer` entries: `policer-name` (e.g., `LIMIT-1G-LIMIT-AS153060-DOWN`), `byte-count` (dropped), `packet-count` (dropped)
2. **Background Scraper Loop (`internal/scraper/firewall.go`):**
   - Jalankan scraper interval yang dapat dikonfigurasi (default: 10–15 detik).
   - Simpan snapshot terbaru ke in-memory cache untuk respon instan API.
3. **Penyimpanan Metrik ke VictoriaMetrics (Prometheus Format):**
   Push counter metrics ke VictoriaMetrics (`/api/v1/import/prometheus`):
   - `junos_firewall_counter_bytes_total{router="MX204", logical_system="<ls>", filter="<filter>", term="<name>"} <bytes>`
   - `junos_firewall_counter_packets_total{...} <packets>`
   - `junos_firewall_policer_drop_bytes_total{router="MX204", logical_system="<ls>", filter="<filter>", policer="<name>"} <bytes>`
   - `junos_firewall_policer_drop_packets_total{...} <packets>`

### B. REST API Endpoints (`backend-go/internal/api`)
Tambahkan routes baru di bawah `/api/v1/firewall`:
1. `GET /api/v1/firewall/filters`
   - Parameter: `logical_system` (default `global`)
   - Returns: Daftar filter yang aktif beserta terms, counters, dan policers.
2. `GET /api/v1/firewall/policers`
   - Returns: Status live policer, batas rate yang dikonfigurasi, dan indikasi apakah sedang terjadi drop (`is_dropping: boolean`).
3. `GET /api/v1/firewall/traffic`
   - Parameter: `logical_system`, `filter`, `counter`, `step` (e.g., `1m`), `time_range` (e.g., `1h`, `24h`)
   - Logic: Query VictoriaMetrics menggunakan fungsi `rate(junos_firewall_counter_bytes_total[1m]) * 8` untuk mengembalikan time-series dalam satuan **bps / Mbps**.

Scope API Key: daftarkan scope baru `read:firewall` (termasuk ke dalam wildcard `read:*`).

### C. Frontend Dashboard (`frontend/src`)
Tambahkan menu / tab baru: **"QoS & Firewall Analytics"**:
1. **Summary Cards:**
   - Menampilkan kartu metrik per-customer/term (e.g., `NARA-DOWN`, `SGM-DOWN`):
     - Current Live Speed (e.g., `260.4 Mbps`)
     - Assigned Limit (e.g., `1 Gbps`)
     - Utilization Gauge / Bar (`26% utilized`)
     - Status Badge: `Normal (Green)` jika drops = 0; `Rate-Limited / Dropping (Red/Yellow)` jika ada kenaikan policer drop.
2. **Time-Series Chart (Recharts):**
   - Area chart interaktif dengan toggle time range (`15m`, `1h`, `6h`, `24h`).
   - Mode komparatif: Stacked Area atau Multi-Line untuk membandingkan traffic antar-customer dalam satu filter fabric.
3. **Drop Investigation Table:**
   - Tabel riwayat kapan customer mengalami over-quota drop beserta total volume bytes yang terpotong.

---

## 4. Acceptance Criteria & Verification
1. [ ] Scraper berhasil mengekstrak data dari MX204 via NETCONF tanpa membebani CPU router (<1% CPU spike).
2. [ ] Mendukung Logical Systems (e.g., `logical-system EXCH`) maupun global instance.
3. [ ] Metrik counter dan policer tersimpan rapi di VictoriaMetrics dengan delta rate Mbps yang akurat saat dibandingkan dengan `run show firewall filter ... | refresh 1`.
4. [ ] API `/api/v1/firewall/traffic` mengembalikan format time-series JSON yang bersih untuk Recharts.
5. [ ] Frontend menampilkan live throughput, visualisasi limit, dan indikator drop secara responsif.
6. [ ] Zero regression pada BGP monitoring dan interface traffic scraper yang sudah ada.
