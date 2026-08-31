import os
import sys
import io
import asyncio
import aiohttp
from PIL import Image
import boto3

R2_ENDPOINT = "https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com"
R2_BUCKET = "machete-covers"
R2_ACCESS_KEY = "bfe2ee169600ee8069cd871043ed82a4"
R2_SECRET_KEY = "698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819"

s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
)

HEADER_IMAGE = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png").convert("RGB")

def optimize_curated_cover(image_data: bytes) -> bytes:
    """Takes a finished curated retail cover and optimizes it to clean WebP (1200x1600)."""
    with Image.open(io.BytesIO(image_data)) as img:
        img = img.convert("RGB")
        resized = img.resize((1200, 1600), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        resized.save(out_io, format="WEBP", quality=95, method=6)
        return out_io.getvalue()

def composite_clean_art_fallback(image_data: bytes) -> bytes:
    """Composites clean background art with the 4K official PS5 master header."""
    with Image.open(io.BytesIO(image_data)) as raw_img:
        raw_img = raw_img.convert("RGB")
        
        WIDTH = 1200
        HEIGHT = 1600
        HEADER_HEIGHT = 154
        
        canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))
        
        art_height = HEIGHT - HEADER_HEIGHT
        art_w, art_h = raw_img.size
        target_ratio = WIDTH / art_height
        src_ratio = art_w / art_h
        
        if src_ratio > target_ratio:
            new_w = int(art_h * target_ratio)
            left = (art_w - new_w) // 2
            cropped = raw_img.crop((left, 0, left + new_w, art_h))
        else:
            new_h = int(art_w / target_ratio)
            top = (art_h - new_h) // 4
            cropped = raw_img.crop((0, top, art_w, top + new_h))
            
        resized_art = cropped.resize((WIDTH, art_height), Image.Resampling.LANCZOS)
        canvas.paste(resized_art, (0, HEADER_HEIGHT))
        canvas.paste(HEADER_IMAGE, (0, 0))
        
        out_io = io.BytesIO()
        canvas.save(out_io, format="WEBP", quality=95, method=6)
        return out_io.getvalue()

async def fetch_best_cover(session: aiohttp.ClientSession, ppsa_id: str):
    # 1. Tier 1: Retroforge / Curated CDN (Finished Box Arts)
    try:
        url_curated = f"https://retroforge-cdn.pages.dev/covers/{ppsa_id}.png"
        async with session.get(url_curated, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                raw = await res.read()
                if len(raw) > 5000: # Valid image
                    return "curated", raw
    except Exception:
        pass

    # 2. Tier 2: SerialStation Store / PlayStation Direct Products
    try:
        url_serial = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
        async with session.get(url_serial, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                data = await res.json()
                items = data.get("items", [])
                if items:
                    images = items[0].get("localization", {}).get("images", [])
                    # Look for Portrait Banner / Gamehub Cover Art
                    for img in images:
                        if img.get("type") in ("PORTRAIT_BANNER", "GAMEHUB_COVER_ART"):
                            img_url = img.get("url")
                            async with session.get(img_url, timeout=aiohttp.ClientTimeout(total=10)) as img_res:
                                if img_res.status == 200:
                                    raw = await img_res.read()
                                    return "clean_art", raw
    except Exception:
        pass

    # 3. Tier 3: Prospero Patches fallback for icon0 / title art
    try:
        url_prospero = f"https://prosperopatches.com/{ppsa_id}"
        async with session.get(url_prospero, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                html = await res.text()
                # Parse meta twitter:image or icon0
                if "cdn.prosperopatches.com/titles/" in html:
                    import re
                    match = re.search(r'https://cdn\.prosperopatches\.com/titles/[^"\']+/icon0\.webp', html)
                    if match:
                        async with session.get(match.group(0), timeout=aiohttp.ClientTimeout(total=8)) as icon_res:
                            if icon_res.status == 200:
                                raw = await icon_res.read()
                                return "curated", raw
    except Exception:
        pass

    return None, None

async def worker(ppsa_id: str, session: aiohttp.ClientSession, semaphore: asyncio.Semaphore):
    async with semaphore:
        cover_type, raw_data = await fetch_best_cover(session, ppsa_id)
        if not raw_data:
            return False

        try:
            loop = asyncio.get_event_loop()
            if cover_type == "curated":
                final_webp = await loop.run_in_executor(None, optimize_curated_cover, raw_data)
                tag = "⭐ Curada Original"
            else:
                final_webp = await loop.run_in_executor(None, composite_clean_art_fallback, raw_data)
                tag = "🎨 Fallback PS5 4K"

            s3.put_object(
                Bucket=R2_BUCKET,
                Key=f"{ppsa_id}.webp",
                Body=final_webp,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
            )
            print(f"✅ {tag}: {ppsa_id}.webp ({len(final_webp) // 1024} KB)")
            return True
        except Exception as e:
            return False

async def main(start_id: int = 1, end_id: int = 10000, concurrency: int = 40):
    ppsa_ids = [f"PPSA{str(i).zfill(5)}" for i in range(start_id, end_id + 1)]
    print(f"🚀 Iniciando Pipeline Maestro de Ingestión ({len(ppsa_ids)} títulos)...")
    print("Prioridad: 1. Curadas Originales -> 2. SerialStation -> 3. Prospero -> 4. Fallback Cabecera PS5 4K\n")
    
    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 MacheteMaster/2.0"}) as session:
        tasks = [worker(pid, session, semaphore) for pid in ppsa_ids]
        results = await asyncio.gather(*tasks)
        success = sum(1 for r in results if r)
        print(f"\n🎉 Ingestión Maestra Completada: {success}/{len(ppsa_ids)} carátulas subidas a Cloudflare R2.")

if __name__ == "__main__":
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 9000
    asyncio.run(main(start, end))
