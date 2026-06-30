#!/usr/bin/env bash
# Run this from a PythonAnywhere Bash console, in the repo root, to deploy the latest main.
#
# Usage:
#   ./deploy.sh
#
# Set PA_WSGI_FILE once (e.g. in ~/.bashrc) or pass it inline:
#   PA_WSGI_FILE=/var/www/yourusername_pythonanywhere_com_wsgi.py ./deploy.sh

set -euo pipefail

WSGI_FILE="${PA_WSGI_FILE:-}"

if [ -z "$WSGI_FILE" ]; then
  echo "PA_WSGI_FILE is not set."
  echo "Set it to your WSGI config file path, e.g.:"
  echo "  export PA_WSGI_FILE=/var/www/yourusername_pythonanywhere_com_wsgi.py"
  exit 1
fi

echo "==> git pull"
git pull

echo "==> activate virtualenv (if present)"
if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "==> collectstatic"
python manage.py collectstatic --noinput

echo "==> migrate"
python manage.py migrate --noinput

echo "==> reloading web app"
touch "$WSGI_FILE"

echo "Done. Changes will be live within a few seconds."
