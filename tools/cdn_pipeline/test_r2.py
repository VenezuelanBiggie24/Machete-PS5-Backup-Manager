import boto3

endpoint = "https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com"
access_key = "bfe2ee169600ee8069cd871043ed82a4"
secret_key = "698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819"

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key,
)

# List buckets
try:
    response = s3.list_buckets()
    buckets = [b["Name"] for b in response.get("Buckets", [])]
    print(f"✅ Connected to R2 successfully! Existing buckets: {buckets}")

    # Create machete-covers if not exists
    if "machete-covers" not in buckets:
        print("Creating bucket machete-covers...")
        s3.create_bucket(Bucket="machete-covers")
        print("✅ Bucket machete-covers created successfully!")
    else:
        print("✅ Bucket machete-covers already exists.")
except Exception as e:
    print(f"❌ Error connecting to R2: {e}")
