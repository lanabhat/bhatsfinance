from django.apps import AppConfig


class LedgerConfig(AppConfig):
    name = 'ledger'

    def ready(self):
        from ledger import signals  # noqa: F401
