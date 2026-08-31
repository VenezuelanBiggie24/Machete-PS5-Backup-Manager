import asyncio
import aiohttp
from PIL import Image
import io
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

async def upload_game_cover(session, ppsa_id):
    url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
    try:
        async with session.get(url) as res:
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
                        async with session.get(img_url) as img_res:
                            if img_res.status == 200:
                                raw_bytes = await img_res.read()
                                loop = asyncio.get_event_loop()
                                webp_bytes = await loop.run_in_executor(None, optimize_image_to_webp, raw_bytes)
                                
                                s3.put_object(
                                    Bucket=R2_BUCKET,
                                    Key=f"{ppsa_id}.webp",
                                    Body=webp_bytes,
                                    ContentType="image/webp",
                                    CacheControl="public, max-age=31536000, immutable",
                                )
                                print(f"✅ Subido con éxito a R2: {ppsa_id}.webp ({len(webp_bytes) // 1024} KB)")
                                return True
    except Exception as e:
        print(f"Error {ppsa_id}: {e}")
    return False

async def main():
    test_ids = ["PPSA01342", "PPSA08330", "PPSA01284", "PPSA01411"]
    async with aiohttp.ClientSession() as session:
        for tid in test_ids:
            await upload_game_cover(session, tid)

    # Verify uploaded objects in R2
    print("\n🔍 Verificando objetos guardados en Cloudflare R2:")
    res = s3.list_objects_v2(Bucket=R2_BUCKET)
    for obj in res.get("Contents", []):
        print(f"  📦 {obj['Key']} - {obj['Size']} bytes")

asyncio.run(main())
