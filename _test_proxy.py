import urllib.request, json, ssl

data = json.dumps({"username": "admin@hexalyte.com", "password": "akila123"}).encode()
req = urllib.request.Request(
    "https://zane.salon.hexalyte.com/api/auth/login",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
ctx = ssl.create_default_context()
try:
    with urllib.request.urlopen(req, context=ctx) as r:
        print("Status:", r.status)
        print("Body:", r.read().decode())
except urllib.error.HTTPError as e:
    print("Status:", e.code)
    print("Body:", e.read().decode())
