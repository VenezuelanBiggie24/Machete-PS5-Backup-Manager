import urllib.request
import urllib.parse
import json

def search_steamgriddb(game_name):
    # Free public search on steamgriddb
    encoded = urllib.parse.quote(game_name)
    url = f"https://www.steamgriddb.com/api/v2/search/autocomplete/{encoded}"
    # Let's test with public headers
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode('utf-8'))
            print(f"Search for '{game_name}':", data.get("data", [])[:2])
    except Exception as e:
        print(f"Error: {e}")

search_steamgriddb("Resident Evil Village")
search_steamgriddb("God of War Ragnarok")
search_steamgriddb("Demon's Souls")
