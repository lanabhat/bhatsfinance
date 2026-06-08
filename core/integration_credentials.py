from __future__ import annotations

from typing import Optional

from core.models import IntegrationCredential


def get_global_secret(key: str) -> Optional[str]:
    """
    Returns decrypted secret value for a global IntegrationCredential, if present.
    """
    if not key:
        return None
    row = (
        IntegrationCredential.objects
        .filter(key=key, scope=IntegrationCredential.Scope.GLOBAL, household__isnull=True, user__isnull=True)
        .first()
    )
    if not row or not row.value:
        return None
    return row.value

