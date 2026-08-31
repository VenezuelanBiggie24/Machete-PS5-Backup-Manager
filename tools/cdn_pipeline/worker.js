/**
 * Machete PS5 CDN - Cloudflare Worker Edge Handler
 * 
 * Flow:
 * 1. Client requests /PPSA01452.webp
 * 2. Checks R2 bucket. If found, returns image instantly from Edge Cache.
 * 3. If 404 (New Game Release):
 *    - Fetches official cover from SerialStation / Sony API on-demand.
 *    - Optimizes and permanently saves to R2 bucket.
 *    - Returns image to user.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // e.g. PPSA01452.webp

    if (!key || key === "" || key === "favicon.ico") {
      return new Response("Machete PS5 CDN Active", { status: 200 });
    }

    // Extract PPSA ID
    const ppsaMatch = key.toUpperCase().match(/(PPSA\d{5})/);
    if (!ppsaMatch) {
      return new Response("Invalid Title ID format", { status: 400 });
    }
    const ppsa = ppsaMatch[1];
    const r2Key = `${ppsa}.webp`;

    // 1. Check R2 Bucket
    const object = await env.MACHETE_COVERS.get(r2Key);
    if (object !== null) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // 2. On-Demand Fetch from SerialStation
    try {
      const apiUrl = `https://api.serialstation.com/v1/store/products?title_id_search=${ppsa}`;
      const apiRes = await fetch(apiUrl, {
        headers: { "User-Agent": "Machete-CDN-Edge/2.0" },
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        const items = data?.items || [];
        if (items.length > 0) {
          const images = items[0]?.localization?.images || [];
          let targetImgUrl = null;
          for (const img of images) {
            if (img.type === "PORTRAIT_BANNER" || img.type === "GAMEHUB_COVER_ART") {
              targetImgUrl = img.url;
              break;
            }
          }

          if (targetImgUrl) {
            const imgRes = await fetch(targetImgUrl);
            if (imgRes.ok) {
              const imageBlob = await imgRes.blob();
              
              // Save to R2 in background
              ctx.waitUntil(
                env.MACHETE_COVERS.put(r2Key, imageBlob, {
                  httpMetadata: {
                    contentType: "image/jpeg",
                    cacheControl: "public, max-age=31536000, immutable",
                  },
                })
              );

              const headers = new Headers();
              headers.set("Content-Type", "image/jpeg");
              headers.set("Cache-Control", "public, max-age=86400");
              headers.set("Access-Control-Allow-Origin", "*");
              return new Response(imageBlob, { headers });
            }
          }
        }
      }
    } catch (err) {
      // Fallback
    }

    // 3. Fallback to Retroforge CDN proxy
    try {
      const fallbackUrl = `https://retroforge-cdn.pages.dev/covers/${ppsa}.png`;
      const fallbackRes = await fetch(fallbackUrl);
      if (fallbackRes.ok) {
        const blob = await fallbackRes.blob();
        ctx.waitUntil(
          env.MACHETE_COVERS.put(r2Key, blob, {
            httpMetadata: {
              contentType: "image/png",
              cacheControl: "public, max-age=31536000, immutable",
            },
          })
        );
        return new Response(blob, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    } catch (_) {}

    return new Response("Cover Not Found", { status: 404 });
  },
};
