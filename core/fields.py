from django.db import models

from core.crypto import decrypt_str, encrypt_str


class EncryptedTextField(models.TextField):
    """
    Stores a string encrypted-at-rest using Fernet.

    The DB column contains a ciphertext string prefixed with "enc:".
    Reading returns the decrypted plaintext.
    """

    prefix = 'enc:'

    def get_prep_value(self, value):
        if value is None:
            return ''
        value = str(value)
        if value == '':
            return ''
        if value.startswith(self.prefix):
            return value
        return f'{self.prefix}{encrypt_str(value)}'

    def from_db_value(self, value, expression, connection):
        if value is None:
            return ''
        if isinstance(value, str) and value.startswith(self.prefix):
            return decrypt_str(value[len(self.prefix):], default='')
        # Backward compatibility: old plaintext rows (pre-encryption migration).
        return str(value)

    def to_python(self, value):
        if value is None:
            return ''
        if isinstance(value, str) and value.startswith(self.prefix):
            return decrypt_str(value[len(self.prefix):], default='')
        return str(value)

