import asyncio
import aiohttp
import json

async def test():
    test_ids = ["PPSA01452", "PPSA01342", "PPSA08330", "PPSA01284", "PPSA01411", "PPSA01625"]
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Machete/2.0"}) as session:
        for ppsa in test_ids:
            # 1. Serialstation
            url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa}"
            async with session.get(url) as res:
                print(f"{ppsa} -> status: {res.status}")
                if res.status == 200:
                    data = await res.json()
                    items = data.get("items", [])
                    print(f"  Items found: {len(items)}")
                    if items:
                        name = items[0].get("name_en") or items[0].get("localization", {}).get("name")
                        images = items[0].get("localization", {}).get("images", [])
                        print(f"  Game: {name}, Images count: {len(images)}")
                        for img in images:
                            print(f"    - Type: {img.get('type')}, URL: {img.get('url')[:60]}...")

asyncio.run(test())
