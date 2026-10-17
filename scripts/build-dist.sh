#!/bin/sh
# Builds dist/ with ONLY the public site files for Cloudflare Pages.
# Cloudflare Pages direct upload serves every file in the deploy folder (.assetsignore is Workers-only),
# so internal folders (.claude, tmp, supabase, netlify, scripts, output, elijah-v2, node_modules, configs, docs)
# are kept out by copying an allowlist. functions/ stays at the project root and is compiled by wrangler from there.
# Deploy:  sh scripts/build-dist.sh && npx --yes wrangler@latest pages deploy dist --project-name elijah-bryant --branch <branch> --commit-dirty=true
set -e
cd "$(dirname "$0")/.."
PUBLIC="index.html book.html 404.html favicon.ico _redirects _routes.json js css images videos resources guides waitlist ask-elijah"
rm -rf dist && mkdir dist
for p in $PUBLIC; do
  [ -e "$p" ] || { echo "missing: $p" >&2; exit 1; }
  rsync -a --exclude='.*' --exclude='*.md' "$p" dist/
done
echo "dist/ built: $(find dist -type f | wc -l | tr -d ' ') files"
