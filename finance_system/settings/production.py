import os
from pathlib import Path

from dotenv import load_dotenv

# Load production secrets from a .env file uploaded directly to the server
# (never committed — see .env.example for the variable list) BEFORE importing
# from .base, since base.py reads several SOCIAL_AUTH_*/SUPERADMIN_* values
# from os.environ at import time.
load_dotenv(Path(__file__).resolve().parent.parent.parent / '.env')

from .base import *  # noqa: F401,F403,E402
from .base import BASE_DIR, MIDDLEWARE  # noqa: E402

SECRET_KEY = os.environ['SECRET_KEY']

DEBUG = False

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '').split(',') if h.strip()]

FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', '').rstrip('/')
BACKEND_BASE_URL = os.environ.get('BACKEND_BASE_URL', '').rstrip('/')

CSRF_TRUSTED_ORIGINS = [origin for origin in (FRONTEND_BASE_URL, BACKEND_BASE_URL) if origin]
CORS_ALLOWED_ORIGINS = [origin for origin in (FRONTEND_BASE_URL,) if origin]

LOGIN_URL = f'{FRONTEND_BASE_URL}/#/login'
LOGIN_REDIRECT_URL = f'{FRONTEND_BASE_URL}/#/home'
SOCIAL_AUTH_LOGIN_REDIRECT_URL = f'{FRONTEND_BASE_URL}/#/home'
SOCIAL_AUTH_NEW_USER_REDIRECT_URL = f'{FRONTEND_BASE_URL}/#/home'

SOCIAL_AUTH_REDIRECT_IS_HTTPS = True
SOCIAL_AUTH_GOOGLE_OAUTH2_REDIRECT_URI = f'{BACKEND_BASE_URL}/api/auth/complete/google-oauth2/'

GMAIL_OAUTH_REDIRECT_URI = os.environ.get('GMAIL_OAUTH_REDIRECT_URI', f'{BACKEND_BASE_URL}/api/gmail/connect/callback')

# ── Static files: serve Django admin/DRF assets + the built React SPA ───────
MIDDLEWARE = ['whitenoise.middleware.WhiteNoiseMiddleware'] + MIDDLEWARE
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
STATICFILES_DIRS = [BASE_DIR / 'frontend' / 'dist']

# The built React app is served from the site root by WhiteNoise: /assets/*, /sw.js,
# /icons/*, /splash/*, /manifest.json … (index.html itself comes from FrontendAppView).
# deploy.sh pre-compresses these files so WhiteNoise can send gzip/brotli.
WHITENOISE_ROOT = BASE_DIR / 'frontend' / 'dist'


def _is_hashed_frontend_asset(path, url):
    """Vite's content-hashed build files never change, so browsers may cache them for a year."""
    import re
    return re.match(r'^/assets/.+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|svg|png)$', url) is not None


WHITENOISE_IMMUTABLE_FILE_TEST = _is_hashed_frontend_asset

# ── Security headers (PythonAnywhere terminates TLS at its proxy) ───────────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
