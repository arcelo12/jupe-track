#!/usr/bin/env python3
"""Contoh klien JupeTrack API — hanya stdlib (urllib).

Autentikasi (pilih salah satu):
  - Set env JUPETRACK_API_KEY="jpt_<40 hex>"  -> memakai header X-API-Key
  - Set env JUPETRACK_USERNAME + JUPETRACK_PASSWORD -> login via /auth/login

Jalankan:
  JUPETRACK_API_KEY=jpt_xxx python3 python_client.py
"""

import json
import os
import sys
import urllib.request

BASE_URL = os.environ.get("JUPETRACK_BASE_URL", "http://localhost:8085/api/v1")


def http_get(path: str, headers: dict) -> dict:
    """GET sederhana dengan header autentikasi; raise bila status bukan 2xx."""
    req = urllib.request.Request(BASE_URL + path, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def http_post(path: str, payload: dict) -> dict:
    """POST JSON (dipakai untuk login)."""
    req = urllib.request.Request(
        BASE_URL + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def build_auth_headers() -> dict:
    """Bangun header autentikasi: utamakan API key, fallback ke login JWT."""
    api_key = os.environ.get("JUPETRACK_API_KEY")
    if api_key:
        # Mode API key — cukup satu header, scope sudah melekat pada key
        return {"X-API-Key": api_key}

    # Mode JWT — login dulu untuk mendapatkan access_token
    user = os.environ.get("JUPETRACK_USERNAME", "admin")
    password = os.environ.get("JUPETRACK_PASSWORD")
    if not password:
        sys.exit(
            "Set JUPETRACK_API_KEY, atau JUPETRACK_USERNAME + JUPETRACK_PASSWORD"
        )
    tokens = http_post("/auth/login", {"username": user, "password": password})
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def main() -> None:
    headers = build_auth_headers()

    # Ambil daftar BGP peer dari cache live (scope: read:bgp)
    peers = http_get("/live/bgp?logical_system=global", headers)
    print("=== /live/bgp ===")
    print(json.dumps(peers, indent=2))

    # Ambil status perangkat: CPU, memori, suhu, uptime (scope: read:device)
    status = http_get("/metrics/device/status", headers)
    print("=== /metrics/device/status ===")
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
