import urllib.request
import json

url = "https://api.serialstation.com/v1/store/products?title_id_search=PPSA01557"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as res:
    data = json.loads(res.read().decode('utf-8'))

print("Item count:", len(data.get("items", [])))
for item in data.get("items", []):
    name = item.get("name_en") or item.get("localization", {}).get("name")
    print(f"Product: {name}")
    images = item.get("localization", {}).get("images", [])
    for img in images:
        print(f"  - Type: {img.get('type')}, URL: {img.get('url')}")
