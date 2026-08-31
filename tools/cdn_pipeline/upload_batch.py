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

def optimize_image_to_webp(image_data: bytes) -> bytes:
    with Image.open(io.BytesIO(image_data)) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        resized = img.resize((600, 900), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        resized.save(out_io, format="WEBP", quality=82, method=6)
        return out_io.getvalue()

async def fetch_cover(session: aiohttp.ClientSession, ppsa_id: str) -> tuple[str, bytes | None]:
    # 1. Try SerialStation
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
                                return ppsa_id, await img_res.read()
    except Exception:
        pass

    # 2. Try Retroforge CDN fallback
    try:
        url = f"https://retroforge-cdn.pages.dev/covers/{ppsa_id}.png"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as res:
            if res.status == 200:
                return ppsa_id, await res.read()
    except Exception:
        pass

    return ppsa_id, None

async def worker(ppsa_id: str, session: aiohttp.ClientSession, semaphore: asyncio.Semaphore):
    async with semaphore:
        _, raw_data = await fetch_cover(session, ppsa_id)
        if not raw_data:
            return False

        try:
            loop = asyncio.get_event_loop()
            webp_bytes = await loop.run_in_executor(None, optimize_image_to_webp, raw_data)
            
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=f"{ppsa_id}.webp",
                Body=webp_bytes,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
            )
            print(f"✅ Uploaded to R2: {ppsa_id}.webp ({len(webp_bytes) // 1024} KB)")
            return True
        except Exception as e:
            print(f"❌ Failed {ppsa_id}: {e}")
            return False

async def main(start: int, end: int, concurrency: int = 20):
    ppsa_ids = [f"PPSA{str(i).zfill(5)}" for i in range(start, end + 1)]
    print(f"🚀 Scraping & Uploading {len(ppsa_ids)} PS5 covers to Cloudflare R2 ({ppsa_ids[0]} -> {ppsa_ids[-1]})...")

    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Machete-CDN/2.0"}) as session:
        tasks = [worker(pid, session, semaphore) for pid in ppsa_ids]
        results = await asyncio.gather(*tasks)
        success = sum(1 for r in results if r)
        print(f"\n🎉 Batch Complete: {success}/{len(ppsa_ids)} covers uploaded to R2.")

if __name__ == "__main__":
    start_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    end_id = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
    asyncio.run(main(start_id, end_id))
