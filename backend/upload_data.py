"""One-shot script to upload all synthetic CSV files to the running backend."""
import os
import sys
import json

import requests

BASE = "http://localhost:8000"

# ── Authenticate ─────────────────────────────────────────────────────────────
r = requests.post(f"{BASE}/auth/token", json={"username": "admin", "password": "admin@gst123"}, timeout=10)
if r.status_code != 200:
    print(f"Login failed: {r.status_code} {r.text}")
    sys.exit(1)

token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"Login OK — token len={len(token)}\n")

# ── Upload files in dependency order ─────────────────────────────────────────
uploads = [
    ("taxpayers",    "data/synthetic/taxpayers.xlsx"),
    ("invoices",     "data/synthetic/invoices.xlsx"),
    ("gstr1",        "data/synthetic/gstr1.xlsx"),
    ("gstr2b",       "data/synthetic/gstr2b.xlsx"),
    ("gstr3b",       "data/synthetic/gstr3b.xlsx"),
    ("tax-payments", "data/synthetic/tax_payments.xlsx"),
]

for endpoint, fpath in uploads:
    if not os.path.exists(fpath):
        print(f"  SKIP  {fpath!r} — file not found")
        continue
    fname = os.path.basename(fpath)
    mime  = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    with open(fpath, "rb") as fh:
        resp = requests.post(
            f"{BASE}/upload/{endpoint}",
            headers=headers,
            files={"file": (fname, fh, mime)},
            timeout=120,
        )
    if resp.status_code == 200:
        j = resp.json()
        loaded  = j.get("loaded", "?")
        skipped = j.get("skipped", "?")
        ms      = j.get("duration_ms", "?")
        errs    = j.get("errors", [])
        print(f"  OK    {fname:<22s}  loaded={loaded:>4}  skipped={skipped:>3}  {ms} ms")
        if errs:
            # Print first error only
            print(f"          first error: {errs[0]}")
    else:
        print(f"  FAIL  {fname:<22s}  HTTP {resp.status_code}")
        print(f"          {resp.text[:300]}")

# ── Graph stats ───────────────────────────────────────────────────────────────
print("\n── Graph stats ─────────────────────────────────────────────────────────")
rs = requests.get(f"{BASE}/graph/stats", headers=headers, timeout=30)
if rs.status_code == 200:
    stats = rs.json()
    for k, v in stats["nodes"].items():
        print(f"  {k:<15s}: {v}")
    print(f"  {'TOTAL nodes':<15s}: {stats['total_nodes']}")
    print(f"  {'TOTAL rels':<15s}: {stats['total_relationships']}")
else:
    print(f"  Stats failed: {rs.status_code}")

# ── Overview endpoint ─────────────────────────────────────────────────────────
print("\n── /graph/overview test ────────────────────────────────────────────────")
ro = requests.get(f"{BASE}/graph/overview?limit=5", headers=headers, timeout=30)
print(f"  Status: {ro.status_code}  body_len={len(ro.text)}")
if ro.status_code == 200:
    ov = ro.json()
    print(f"  nodes={ov['node_count']}  edges={ov['edge_count']}")
    for n in ov["nodes"][:3]:
        print(f"    {n['label']:12s} id={n['id']}")
else:
    print(f"  {ro.text[:400]}")
