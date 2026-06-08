from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ingestion.models import ImportBatch, ImportRow
from ledger.models import Transaction


def _to_rows(csv_content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(csv_content))
    return [dict(row) for row in reader]


@transaction.atomic
def process_csv_import(household_id: int, filename: str, rows: list[dict]) -> dict:
    batch = ImportBatch.objects.create(household_id=household_id, source=ImportBatch.SourceType.CSV, filename=filename or '')
    created = 0
    duplicates = 0
    errors = 0

    for i, row in enumerate(rows, start=1):
        key = (row.get('idempotency_key') or '').strip()
        import_row = ImportRow.objects.create(batch=batch, row_number=i, idempotency_key=key, raw_payload=row)

        try:
            if key and Transaction.objects.filter(household_id=household_id, idempotency_key=key).exists():
                import_row.status = ImportRow.RowStatus.DUPLICATE
                import_row.error_message = 'Duplicate idempotency_key'
                import_row.save(update_fields=['status', 'error_message', 'updated_at'])
                duplicates += 1
                continue

            tx = Transaction.objects.create(
                household_id=household_id,
                account_id=int(row['account_id']),
                member_id=int(row['member_id']) if row.get('member_id') else None,
                instrument_id=int(row['instrument_id']) if row.get('instrument_id') else None,
                tx_date=date.fromisoformat(row['tx_date']),
                amount=Decimal(str(row['amount'])),
                quantity=Decimal(str(row['quantity'])) if row.get('quantity') else None,
                price_per_unit=Decimal(str(row['price_per_unit'])) if row.get('price_per_unit') else None,
                direction=row['direction'],
                transaction_type=row['transaction_type'],
                source=Transaction.SourceType.CSV,
                external_reference=row.get('external_reference', ''),
                idempotency_key=key,
                metadata=row.get('metadata') if isinstance(row.get('metadata'), dict) else {},
            )
            import_row.transaction = tx
            import_row.status = ImportRow.RowStatus.CREATED
            import_row.save(update_fields=['transaction', 'status', 'updated_at'])
            created += 1
        except Exception as exc:  # noqa: BLE001
            import_row.status = ImportRow.RowStatus.ERROR
            import_row.error_message = str(exc)
            import_row.save(update_fields=['status', 'error_message', 'updated_at'])
            errors += 1

    batch.status = ImportBatch.StatusType.FAILED if errors else ImportBatch.StatusType.COMPLETED
    batch.completed_at = timezone.now()
    batch.error_message = '' if errors == 0 else f'{errors} rows failed'
    batch.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])

    return {
        'batch_id': batch.id,
        'created': created,
        'duplicates': duplicates,
        'errors': errors,
    }


def parse_and_process(household_id: int, filename: str, csv_content: str | None, rows: list[dict] | None):
    payload_rows = rows if rows is not None else _to_rows(csv_content or '')
    return process_csv_import(household_id=household_id, filename=filename, rows=payload_rows)
