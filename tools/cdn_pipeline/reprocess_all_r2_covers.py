import io
import sys
import asyncio
from PIL import Image, ImageDraw
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

# Load the master 4K clean header
HEADER_IMAGE = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png").convert("RGB")

def composite_ps5_header(image_data: bytes) -> bytes:
    """Composites the official 4K PS5 master header onto any game cover."""
    with Image.open(io.BytesIO(image_data)) as raw_img:
        raw_img = raw_img.convert("RGB")
        
        WIDTH = 1200
        HEIGHT = 1600
        HEADER_HEIGHT = 154
        
        canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))
        
        # 1. Resize artwork to fit full-bleed below header (1200 x 1446)
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
        
        # 2. Paste 4K Master Header
        canvas.paste(HEADER_IMAGE, (0, 0))
        
        out_io = io.BytesIO()
        canvas.save(out_io, format="WEBP", quality=94, method=6)
        return out_io.getvalue()

def process_and_upload(key: str):
    try:
        # Download existing object
        res = s3.get_object(Bucket=R2_BUCKET, Key=key)
        raw_bytes = res["Body"].read()
        
        # Composite with 4K header
        boxed_webp = composite_ps5_header(raw_bytes)
        
        # Overwrite in R2
        s3.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=boxed_webp,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
        print(f"✅ Reprocesada en 4K: {key} ({len(boxed_webp) // 1024} KB)")
        return True
    except Exception as e:
        print(f"❌ Error en {key}: {e}")
        return False

async def worker(queue, semaphore):
    while not queue.empty():
        key = await queue.get()
        async with semaphore:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, process_and_upload, key)
        queue.task_done()

async def main(concurrency: int = 30):
    print("🔍 Obteniendo lista de todas las carátulas existentes en Cloudflare R2...")
    paginator = s3.get_paginator("list_objects_v2")
    keys = []
    for page in paginator.paginate(Bucket=R2_BUCKET):
        for obj in page.get("Contents", []):
            k = obj["Key"]
            if k.startswith("PPSA") and k.endswith(".webp"):
                keys.append(k)
                
    print(f"🚀 Iniciando reprocesamiento masivo en 4K para {len(keys)} carátulas...")
    
    queue = asyncio.Queue()
    for k in keys:
        queue.put_nowait(k)
        
    semaphore = asyncio.Semaphore(concurrency)
    tasks = [asyncio.create_task(worker(queue, semaphore)) for _ in range(concurrency)]
    
    await queue.join()
    for t in tasks:
        t.cancel()
        
    print(f"\n🎉 ¡Reprocesamiento 4K completado con éxito para todas las {len(keys)} carátulas en Cloudflare R2!")

if __name__ == "__main__":
    asyncio.run(main())
