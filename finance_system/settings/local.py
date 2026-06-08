import os

from dotenv import load_dotenv

from .base import *  # noqa: F401,F403
from .base import BASE_DIR

load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure--x^+$)+_43im%_!rj%-oqlte4$72e2c0qkvq$z76dtz^0jwjr6')

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '10.16.130.205', '10.0.2.2']

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

# After OAuth complete, redirect to frontend
LOGIN_URL = 'http://localhost:5173/#/login'
LOGIN_REDIRECT_URL = 'http://localhost:5173/#/home'
SOCIAL_AUTH_LOGIN_REDIRECT_URL = 'http://localhost:5173/#/home'
SOCIAL_AUTH_NEW_USER_REDIRECT_URL = 'http://localhost:5173/#/home'

SOCIAL_AUTH_REDIRECT_IS_HTTPS = False

# Keep the OAuth flow on the same host (`localhost`) end-to-end so the
# session cookie used for the OAuth `state` round-trip is always present.
SOCIAL_AUTH_GOOGLE_OAUTH2_REDIRECT_URI = 'http://localhost:8000/api/auth/complete/google-oauth2/'

# Frontend base URL used for non-login redirects (e.g. Gmail connect callback).
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:5173')
# Redirect URI registered in Google Cloud Console for Gmail connect.
GMAIL_OAUTH_REDIRECT_URI = os.environ.get('GMAIL_OAUTH_REDIRECT_URI', 'http://localhost:8000/api/gmail/connect/callback')
