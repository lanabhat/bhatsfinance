#!/usr/bin/env bash
# Run this from a PythonAnywhere Bash console, in the repo root, to deploy the latest main.
#
# Usage:
#   ./deploy.sh
#
# Pulls latest main, runs migrations and collectstatic. Restart the web
# app manually from the PythonAnywhere dashboard afterwards.

set -euo pipefail

echo "==> git pull"
git pull

echo "==> activate virtualenv (if present)"
if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "==> pip install"
pip install -r requirements.txt

echo "==> migrate"
python manage.py migrate --noinput

echo "==> collectstatic"
python manage.py collectstatic --noinput -c

echo "==> compress frontend build (gzip/brotli copies for WhiteNoise)"
# Drop copies from the previous deploy first: a stale sw.js.gz would otherwise be
# served in place of the new sw.js.
find frontend/dist \( -name '*.gz' -o -name '*.br' \) -delete
python -m whitenoise.compress frontend/dist

echo "Done. Restart the web app from the PythonAnywhere dashboard to apply changes."
