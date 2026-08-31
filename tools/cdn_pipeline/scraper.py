#!/usr/bin/env python3
"""
Machete PS5 CDN Pipeline - Bulk Cover Scraper & Optimizer
Crawls PS5 PPSA IDs, retrieves official portrait covers,
optimizes to WebP 600x900px, and uploads to Cloudflare R2 / S3.

Usage:
  python3 scraper.py --start 1 --end 5000 [--upload]
"""

import os
import sys
import io
import asyncio
import aiohttp
from PIL import Image

try:
    import boto3
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

# Configuration
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "")
R2_BUCKET = os.getenv("R2_BUCKET", "machete-covers")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.getenv("R2_SECRET_KEY", "")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "covers")

# CDN Sources in prioritized order
SOURCES = [
    "https://api.serialstation.com/v1/store/products?title_id_search={id}",
    "https://retroforge-cdn.pages.dev/covers/{id}.png",
]

def get_s3_client():
    if not HAS_BOTO3 or not R2_ENDPOINT:
        return None
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
    )

def optimize_image_to_webp(image_data: bytes) -> bytes:
    """Resizes to 600x900 and encodes to high-quality WebP (~50-70KB)."""
    with Image.open(io.BytesIO(image_data)) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        # Target 3:4 / 2:3 vertical aspect
        resized = img.resize((600, 900), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        resized.save(out_io, format="WEBP", quality=82, method=6)
        return out_io.getvalue()

async def fetch_cover_for_ppsa(session: aiohttp.ClientSession, ppsa_id: str) -> bytes | None:
    # 1. Try SerialStation API
    try:
        url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                data = await res.json()
                items = data.get("items", [])
                if items:
                    images = items[0].get("localization", {}).get("images", [])
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

    # 2. Try Retroforge CDN fallback
    try:
        url = f"https://retroforge-cdn.pages.dev/covers/{ppsa_id}.png"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                return await res.read()
    except Exception:
        pass

    return None

async def process_title(session: aiohttp.ClientSession, ppsa_id: str, s3_client=None, save_local=True):
    raw_data = await fetch_cover_for_ppsa(session, ppsa_id)
    if not raw_data:
        return False

    try:
        loop = asyncio.get_event_loop()
        webp_bytes = await loop.run_in_executor(None, optimize_image_to_webp, raw_data)

        if save_local:
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            local_path = os.path.join(OUTPUT_DIR, f"{ppsa_id}.webp")
            with open(local_path, "wb") as f:
                f.write(webp_bytes)

        if s3_client:
            s3_client.put_object(
                Bucket=R2_BUCKET,
                Key=f"{ppsa_id}.webp",
                Body=webp_bytes,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
            )
        print(f"✅ [SUCCESS] {ppsa_id} processed ({len(webp_bytes) // 1024} KB)")
        return True
    except Exception as e:
        print(f"❌ [ERROR] {ppsa_id}: {e}")
        return False

async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Machete PS5 CDN Bulk Scraper")
    parser.add_argument("--start", type=int, default=1, help="Start PPSA sequence number")
    parser.add_argument("--end", type=int, default=2000, help="End PPSA sequence number")
    parser.add_argument("--concurrency", type=int, default=15, help="Concurrent workers")
    parser.add_argument("--upload", action="store_true", help="Upload to R2 bucket")
    args = parser.parse_args()

    s3_client = get_s3_client() if args.upload else None
    ppsa_list = [f"PPSA{str(i).zfill(5)}" for i in range(args.start, args.end + 1)]
    print(f"🚀 Starting Machete CDN Scraper for {len(ppsa_list)} PS5 titles (PPSA{str(args.start).zfill(5)} - PPSA{str(args.end).zfill(5)})...")

    semaphore = asyncio.Semaphore(args.concurrency)

    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Machete/2.0"}) as session:
        async def sem_worker(ppsa):
            async with semaphore:
                return await process_title(session, ppsa, s3_client=s3_client)

        results = await asyncio.gather(*(sem_worker(p) for p in ppsa_list))
        success_count = sum(1 for r in results if r)
        print(f"\n🎉 Finished: {success_count}/{len(ppsa_list)} covers successfully scraped and optimized.")

if __name__ == "__main__":
    asyncio.run(main())
