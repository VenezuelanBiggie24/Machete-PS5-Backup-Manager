import urllib.request
import json
import boto3
from PIL import Image
import io

s3 = boto3.client(
    "s3",
    endpoint_url="https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com",
    aws_access_key_id="bfe2ee169600ee8069cd871043ed82a4",
    aws_secret_access_key="698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819",
)

def fetch_and_upload_untouched(ppsa_id):
    api_url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
    req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode('utf-8'))
        
    img_url = None
    for img in data['items'][0]['localization']['images']:
        if img.get('type') in ('PORTRAIT_BANNER', 'GAMEHUB_COVER_ART'):
            img_url = img['url']
            break
            
    print(f"Downloading {ppsa_id} from {img_url}")
    art_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(art_req) as res:
        raw = res.read()
        
    with Image.open(io.BytesIO(raw)) as img:
        img = img.convert("RGB")
        resized = img.resize((600, 900), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        resized.save(out_io, format="WEBP", quality=95, method=6)
        webp_bytes = out_io.getvalue()
        
    s3.put_object(
        Bucket="machete-covers",
        Key=f"{ppsa_id}.webp",
        Body=webp_bytes,
        ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable",
    )
    print(f"✅ Subida {ppsa_id}.webp intacta!")

fetch_and_upload_untouched("PPSA01411")
fetch_and_upload_untouched("PPSA08330")
fetch_and_upload_untouched("PPSA01342")
fetch_and_upload_untouched("PPSA01284")
