import base64
import hashlib
from typing import Optional

from django.conf import settings


def _get_fernet_key() -> bytes:
    """
    Returns a urlsafe-base64 encoded 32-byte key as required by Fernet.

    We prefer APP_ENCRYPTION_KEY from env/settings. For local/dev convenience,
    we fall back to a deterministic key derived from Django SECRET_KEY.
    """
    raw = getattr(settings, 'APP_ENCRYPTION_KEY', '') or ''
    if raw.strip():
        # Accept raw 32-byte key (not base64) or a urlsafe-base64 Fernet key.
        try:
            decoded = base64.urlsafe_b64decode(raw.encode('utf-8'))
            if len(decoded) == 32:
                return raw.encode('utf-8')
        except Exception:
            pass

        # Treat as raw string and derive a Fernet key from it.
        digest = hashlib.sha256(raw.encode('utf-8')).digest()
        return base64.urlsafe_b64encode(digest)

    secret = getattr(settings, 'SECRET_KEY', '') or ''
    digest = hashlib.sha256(secret.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_str(value: str) -> str:
    if value is None:
        return ''
    value = str(value)
    if value == '':
        return ''
    from cryptography.fernet import Fernet
    f = Fernet(_get_fernet_key())
    token = f.encrypt(value.encode('utf-8'))
    return token.decode('utf-8')


def decrypt_str(token: str, *, default: Optional[str] = '') -> str:
    if token is None:
        return default or ''
    token = str(token)
    if token == '':
        return default or ''
    from cryptography.fernet import Fernet, InvalidToken
    f = Fernet(_get_fernet_key())
    try:
        raw = f.decrypt(token.encode('utf-8'))
        return raw.decode('utf-8')
    except InvalidToken:
        return default or ''

