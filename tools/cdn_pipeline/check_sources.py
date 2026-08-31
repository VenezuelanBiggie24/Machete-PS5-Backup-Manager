import urllib.request
import json
import asyncio
import aiohttp

async def check_sources(ppsa_id):
    print(f"=== Checking complete untouched covers for {ppsa_id} ===")
    
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0"}) as session:
        # 1. Retroforge CDN (curated box arts)
        url1 = f"https://retroforge-cdn.pages.dev/covers/{ppsa_id}.png"
        async with session.get(url1) as res:
            print(f"Retroforge CDN ({url1}) -> {res.status}")
            
        # 2. Serialstation all images
        url2 = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
        async with session.get(url2) as res:
            if res.status == 200:
                data = await res.json()
                for item in data.get("items", []):
                    name = item.get("name_en") or item.get("localization", {}).get("name")
                    print(f"SerialStation Product: {name}")
                    for img in item.get("localization", {}).get("images", []):
                        itype = img.get("type")
                        iurl = img.get("url")
                        if itype in ("PORTRAIT_BANNER", "GAMEHUB_COVER_ART", "EDITION_KEY_ART", "MASTER"):
                            print(f"  [{itype}] {iurl}")

asyncio.run(check_sources("PPSA01557"))
