import requests

r = requests.post("http://localhost:8000/auth/token", json={"username": "admin", "password": "admin@gst123"}, timeout=10)
h = {"Authorization": "Bearer " + r.json()["access_token"]}

s = requests.get("http://localhost:8000/graph/stats", headers=h, timeout=30)
j = s.json()
print("== Graph Stats ==")
nodes = j.get("nodes", {})
for k, v in nodes.items():
    print(f"  {k}: {v}")
print(f"  TOTAL nodes: {j['total_nodes']}")
print(f"  TOTAL rels:  {j['total_relationships']}")

o = requests.get("http://localhost:8000/graph/overview?limit=5", headers=h, timeout=30)
oj = o.json()
print(f"\n== Overview == status={o.status_code}  nodes={oj['node_count']}  edges={oj['edge_count']}")
for n in oj["nodes"][:5]:
    print(f"  {n['label']:12s}  {n['id']}")
print("ALL OK")
