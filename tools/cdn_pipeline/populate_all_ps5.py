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

def composite_ps5_header(image_data: bytes) -> bytes:
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

async def fetch_game(session: aiohttp.ClientSession, ppsa_id: str):
    # 1. Serialstation with Smart Base-Game Priority
    try:
        url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                data = await res.json()
                items = data.get("items", [])
                if items:
                    # Filter out DLC/Expansions/Packs if possible
                    selected_item = items[0]
                    for item in items:
                        name = (item.get("name_en") or item.get("localization", {}).get("name") or "").lower()
                        if not any(k in name for k in ["pack", "voucher", "expansion", "outfit", "avatar", "demo", "soundtrack"]):
                            selected_item = item
                            break
                            
                    images = selected_item.get("localization", {}).get("images", [])
                    img_url = None
                    for img in images:
                        if img.get("type") in ("PORTRAIT_BANNER", "GAMEHUB_COVER_ART"):
                            img_url = img.get("url")
                            break
                    if img_url:
                        async with session.get(img_url, timeout=aiohttp.ClientTimeout(total=10)) as img_res:
                            if img_res.status == 200:
                                return await img_res.read()
    except Exception:
        pass

    # 2. Retroforge CDN fallback
    try:
        url = f"https://retroforge-cdn.pages.dev/covers/{ppsa_id}.png"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                return await res.read()
    except Exception:
        pass

    return None

async def worker(ppsa_id: str, session: aiohttp.ClientSession, semaphore: asyncio.Semaphore):
    async with semaphore:
        raw_bytes = await fetch_game(session, ppsa_id)
        if not raw_bytes:
            return False

        try:
            loop = asyncio.get_event_loop()
            webp_bytes = await loop.run_in_executor(None, composite_ps5_header, raw_bytes)
            
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=f"{ppsa_id}.webp",
                Body=webp_bytes,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
            )
            print(f"✅ Subida 4K: {ppsa_id}.webp ({len(webp_bytes) // 1024} KB)")
            return True
        except Exception:
            return False

async def main(start_num: int = 1, end_num: int = 10000, concurrency: int = 40):
    ppsa_ids = [f"PPSA{str(i).zfill(5)}" for i in range(start_num, end_num + 1)]
    print(f"🚀 Iniciando scraper 4K con selector de juego principal ({len(ppsa_ids)} títulos)...")
    
    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 Machete/2.0"}) as session:
        tasks = [worker(pid, session, semaphore) for pid in ppsa_ids]
        results = await asyncio.gather(*tasks)
        uploaded = sum(1 for r in results if r)
        print(f"\n🎉 Lote completado: {uploaded} carátulas subidas a Cloudflare R2.")

if __name__ == "__main__":
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
    asyncio.run(main(start, end))
