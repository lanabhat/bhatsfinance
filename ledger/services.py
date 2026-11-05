from datetime import date

from django.db import transaction as db_transaction

from ledger.models import Transaction


def replace_transaction(original: Transaction, changes: dict, extra_metadata: dict | None = None) -> Transaction:
    """Swap a transaction for a corrected copy — amounts, units, price and date can't be
    edited in place (Transaction.save() refuses), and a reversing entry doesn't work for
    buys since units are signed by transaction_type, not direction.

    The copy keeps every other field, the tags and the original's idempotency key (so a
    re-import still recognises it); FD/bond details and import rows that pointed at the
    original are moved to it, and metadata records what changed. `extra_metadata` is
    merged in on top. Raises django ValidationError when the corrected row is invalid."""
    from ingestion.models import ImportRow
    from instruments.models import BondDetails, FDDetails

    values = {
        f.attname: getattr(original, f.attname)
        for f in Transaction._meta.concrete_fields if f.name not in ('id', 'created_at', 'updated_at')
    }
    for field, value in changes.items():
        values[field] = None if value in ('', None) and field in ('quantity', 'price_per_unit') else value
    key = values.pop('idempotency_key')
    values['metadata'] = {
        **(original.metadata or {}),
        **(extra_metadata or {}),
        'corrected_from': original.id,
        'corrected_on': date.today().isoformat(),
        'original_values': {f: str(getattr(original, f)) if getattr(original, f) is not None else None
                            for f in ('tx_date', 'amount', 'quantity', 'price_per_unit')},
    }
    tags = list(original.tags.all())
    for_members = list(original.for_members.all())
    fd_ids = list(FDDetails.objects.filter(funding_transaction=original).values_list('id', flat=True))
    bond_ids = list(BondDetails.objects.filter(funding_transaction=original).values_list('id', flat=True))
    row_ids = list(ImportRow.objects.filter(transaction=original).values_list('id', flat=True))

    with db_transaction.atomic():
        # The key is unique per household, so the copy takes it only once the
        # original is gone; tags go on first so the unused-tag sweep on delete
        # (ledger/signals.py) doesn't remove them.
        corrected = Transaction.objects.create(**values, idempotency_key='')
        corrected.tags.set(tags)
        corrected.for_members.set(for_members)
        original.delete()
        if key:
            Transaction.objects.filter(pk=corrected.pk).update(idempotency_key=key)
        FDDetails.objects.filter(id__in=fd_ids).update(funding_transaction=corrected)
        BondDetails.objects.filter(id__in=bond_ids).update(funding_transaction=corrected)
        ImportRow.objects.filter(id__in=row_ids).update(transaction=corrected)

    corrected.refresh_from_db()
    return corrected
