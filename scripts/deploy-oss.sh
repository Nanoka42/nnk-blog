#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root after downloading this run's validated artifact.
# No sync --delete, ACL changes, or local-to-remote timestamp comparisons.
: "${OSS_BUCKET:?OSS_BUCKET is required}"
: "${OSS_REGION:?OSS_REGION is required}"
: "${OSS_ENDPOINT:?OSS_ENDPOINT is required}"
: "${OSS_ACCESS_KEY_ID:?Temporary credentials are required}"
: "${OSS_ACCESS_KEY_SECRET:?Temporary credentials are required}"
: "${OSS_SESSION_TOKEN:?STS session token is required}"

options=(-r -f --addressing-style cname --no-progress)
case "${DRY_RUN:-true}" in
  true) options+=(--dry-run) ;;
  false) ;;
  *) echo 'DRY_RUN must be true or false' >&2; exit 1 ;;
esac
destination="oss://${OSS_BUCKET}/"

# 1. New hashed resources must exist before pages can reference them.
ossutil cp dist/_astro/ "${destination}_astro/" "${options[@]}" \
  --exclude '*.woff2' --exclude '*.woff' --exclude '*.ttf' \
  --cache-control 'public, max-age=31536000, immutable'
for extension in woff2 woff ttf; do
  # Font detection depends on the runner's MIME database; make it deterministic.
  ossutil cp dist/_astro/ "${destination}_astro/" "${options[@]}" \
    --include "*.${extension}" --content-type "font/${extension}" \
    --cache-control 'public, max-age=31536000, immutable'
done

# 2. Fixed-name resources, including the game's JS/CSS/audio.
# ossutil 2 filters use the first matching rule; / anchors the dist root.
ossutil cp dist/ "$destination" "${options[@]}" \
  --exclude '/_astro/**' --exclude '*.html' \
  --exclude '/rss.xml' --exclude '/sitemap*.xml' --exclude '/robots.txt' \
  --cache-control 'public, max-age=60'

# 3. Feeds and search discovery files, matching the CDN's 300-second rule.
ossutil cp dist/ "$destination" "${options[@]}" \
  --include '/rss.xml' --include '/sitemap*.xml' --include '/robots.txt' \
  --cache-control 'public, max-age=300'

# 4. Publish HTML last, with explicit MIME and display semantics.
ossutil cp dist/ "$destination" "${options[@]}" \
  --include '*.html' --content-type 'text/html; charset=utf-8' \
  --content-disposition inline --cache-control 'public, max-age=60'
