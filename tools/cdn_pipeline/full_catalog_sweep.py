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

DISQUALIFIED_KEYWORDS = [
    "expansion", "dlc", "pack", "voucher", "outfit", "avatar", "costume", 
    "season pass", "soundtrack", "artbook", "bonus", "weapon", "charm",
    "theme", "demo", "trial", "add-on", "addon", "upgrade pack", "skin"
]

def composite_ps5_header_4k(image_data: bytes) -> bytes:
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

def select_best_base_product(items: list) -> dict:
    if not items:
        return None
    candidates = []
    for item in items:
        name = (item.get("name_en") or item.get("localization", {}).get("name") or "").lower()
        is_dlc = any(kw in name for kw in DISQUALIFIED_KEYWORDS)
        images = item.get("localization", {}).get("images", [])
        has_portrait = any(img.get("type") in ("PORTRAIT_BANNER", "EDITION_KEY_ART", "GAMEHUB_COVER_ART") for img in images)
        
        score = 0
        if not is_dlc:
            score += 100
        if "standard" in name or "edition" in name:
            score += 20
        if has_portrait:
            score += 50
        candidates.append((score, item))
        
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1] if candidates else items[0]

def extract_best_image_url(product: dict) -> str:
    images = product.get("localization", {}).get("images", [])
    for img in images:
        if img.get("type") == "PORTRAIT_BANNER":
            return img.get("url")
    for img in images:
        if img.get("type") == "EDITION_KEY_ART":
            return img.get("url")
    for img in images:
        if img.get("type") == "GAMEHUB_COVER_ART":
            return img.get("url")
    return images[0].get("url") if images else None

async def process_title(session: aiohttp.ClientSession, ppsa_id: str, existing_keys: set, semaphore: asyncio.Semaphore):
    if f"{ppsa_id}.webp" in existing_keys:
        return None # Skip already existing in R2

    async with semaphore:
        try:
            url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=7)) as res:
                if res.status != 200:
                    return False
                data = await res.json()
                items = data.get("items", [])
                if not items:
                    return False
                    
            best_product = select_best_base_product(items)
            img_url = extract_best_image_url(best_product)
            if not img_url:
                return False
                
            async with session.get(img_url, timeout=aiohttp.ClientTimeout(total=10)) as img_res:
                if img_res.status != 200:
                    return False
                raw_bytes = await img_res.read()
                
            loop = asyncio.get_event_loop()
            webp_bytes = await loop.run_in_executor(None, composite_ps5_header_4k, raw_bytes)
            
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=f"{ppsa_id}.webp",
                Body=webp_bytes,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
            )
            prod_name = best_product.get("name_en") or best_product.get("localization", {}).get("name") or ppsa_id
            print(f"✅ Nuevo 4K: {ppsa_id}.webp -> {prod_name[:40]}")
            return True
        except Exception:
            return False

async def main(start_id: int = 1, end_id: int = 25000, concurrency: int = 50):
    print("🔍 Obteniendo lista de carátulas ya existentes en Cloudflare R2...")
    paginator = s3.get_paginator("list_objects_v2")
    existing_keys = set()
    for page in paginator.paginate(Bucket=R2_BUCKET):
        for obj in page.get("Contents", []):
            existing_keys.add(obj["Key"])
            
    print(f"📦 Ya existen {len(existing_keys)} carátulas en Cloudflare R2.")
    
    ppsa_ids = [f"PPSA{str(i).zfill(5)}" for i in range(start_id, end_id + 1)]
    remaining_ids = [pid for pid in ppsa_ids if f"{pid}.webp" not in existing_keys]
    
    print(f"🚀 Escaneando los {len(remaining_ids)} títulos restantes para completar el 100% ({ppsa_ids[0]} -> {ppsa_ids[-1]})...\n")
    
    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 MacheteSweep/2.0"}) as session:
        tasks = [process_title(session, pid, existing_keys, semaphore) for pid in remaining_ids]
        results = await asyncio.gather(*tasks)
        uploaded = sum(1 for r in results if r is True)
        print(f"\n🎉 ¡Barrido 100% Completado: {uploaded} nuevas carátulas añadidas a Cloudflare R2!")

if __name__ == "__main__":
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 25000
    asyncio.run(main(start, end))
