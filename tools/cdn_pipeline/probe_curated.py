import asyncio
import aiohttp

test_ids = ["PPSA01411", "PPSA01342", "PPSA08330", "PPSA01284", "PPSA01556", "PPSA01557", "PPSA01452", "PPSA01625", "PPSA01021", "PPSA01001"]

async def test_sources():
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0"}) as session:
        for tid in test_ids:
            print(f"\n--- Probando {tid} ---")
            
            # 1. Retroforge CDN
            url_rf = f"https://retroforge-cdn.pages.dev/covers/{tid}.png"
            async with session.get(url_rf) as r:
                print(f"  Retroforge ({url_rf}) -> Status: {r.status}, Size: {r.headers.get('Content-Length')}")
                
            # 2. GameTDB PS5
            url_gtdb_us = f"https://art.gametdb.com/ps5/cover/US/{tid}.jpg"
            url_gtdb_en = f"https://art.gametdb.com/ps5/cover/EN/{tid}.jpg"
            async with session.get(url_gtdb_us) as r:
                print(f"  GameTDB US ({url_gtdb_us}) -> Status: {r.status}")
            async with session.get(url_gtdb_en) as r:
                print(f"  GameTDB EN ({url_gtdb_en}) -> Status: {r.status}")
                
            # 3. Prospero Patches
            url_prospero = f"https://prosperopatches.com/{tid}"
            async with session.get(url_prospero) as r:
                print(f"  Prospero Patches ({url_prospero}) -> Status: {r.status}")
                if r.status == 200:
                    html = await r.text()
                    import re
                    m = re.search(r'https://cdn\.prosperopatches\.com/titles/[^"\']+/icon0\.webp', html)
                    if m:
                        print(f"    -> Icon URL encontrada: {m.group(0)}")

asyncio.run(test_sources())
