# Machete PS5 CDN Pipeline & Deployment Guide

This directory contains the automation engine to host and maintain a global, zero-cost CDN for PS5 vertical game covers.

---

## 1. Cloudflare R2 Setup (100% Free Tier)

1. Sign up / Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the sidebar, go to **R2 Object Storage** -> **Create bucket**.
3. Name the bucket `machete-covers` (default location: Automatic).
4. Go to **Settings** of the bucket:
   - Under **Custom Domains**, click **Connect Domain** and assign your subdomain (e.g. `cdn.machete.app` or `covers.yourdomain.com`).
   - Under **CORS Policy**, add:
     ```json
     [
       {
         "AllowedOrigins": ["*"],
         "AllowedMethods": ["GET", "HEAD"],
         "AllowedHeaders": ["*"],
         "MaxAgeSeconds": 86400
       }
     ]
     ```
5. In **R2 Overview**, click **Manage R2 API Tokens** -> **Create API Token** (Permissions: *Admin Read & Write*).
6. Copy `Access Key ID`, `Secret Access Key`, and the `Endpoint URL`.

---

## 2. Running the Bulk Scraper Locally

```bash
# 1. Install dependencies
pip install aiohttp pillow boto3

# 2. Set environment variables (optional if uploading directly to R2)
export R2_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
export R2_BUCKET="machete-covers"
export R2_ACCESS_KEY="<YOUR_R2_ACCESS_KEY>"
export R2_SECRET_KEY="<YOUR_R2_SECRET_KEY>"

# 3. Run scraper (scrapes PPSA00001 to PPSA05000 and uploads to R2)
python3 tools/cdn_pipeline/scraper.py --start 1 --end 5000 --concurrency 20 --upload
```

---

## 3. Automated Weekly Sync (GitHub Actions)

Add the following repository secrets in GitHub (`Settings -> Secrets and variables -> Actions`):
- `R2_ENDPOINT`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY`: `<YOUR_R2_ACCESS_KEY>`
- `R2_SECRET_KEY`: `<YOUR_R2_SECRET_KEY>`
- `R2_BUCKET`: `machete-covers`

The workflow in `.github/workflows/cdn_sync.yml` will automatically check and sync new PS5 titles every week.
