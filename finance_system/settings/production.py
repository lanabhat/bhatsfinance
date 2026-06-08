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

# ── Security headers (PythonAnywhere terminates TLS at its proxy) ───────────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
