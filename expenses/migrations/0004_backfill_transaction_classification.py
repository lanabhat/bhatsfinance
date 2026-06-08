"""
Backfill: for each existing Expense, find the Transaction created by Expense._create_transaction()
(identified by idempotency_key='expense-{expense.pk}') and stamp it with
classification='spend', spend_category, description, notes, and for_members.

Uses QuerySet.update() to bypass Transaction's immutability guard on .save().
"""
from django.db import migrations


def backfill_expense_classifications(apps, schema_editor):
    Expense = apps.get_model('expenses', 'Expense')
    Transaction = apps.get_model('ledger', 'Transaction')

    for expense in Expense.objects.prefetch_related('for_members').iterator(chunk_size=200):
        ikey = f'expense-{expense.pk}'
        updated = Transaction.objects.filter(idempotency_key=ikey).update(
            classification='spend',
            spend_category=expense.category or 'other',
            description=expense.description or '',
            notes=expense.notes or '',
        )
        if updated:
            tx = Transaction.objects.get(idempotency_key=ikey)
            tx.for_members.set(expense.for_members.all())


def reverse_backfill(apps, schema_editor):
    Transaction = apps.get_model('ledger', 'Transaction')
    Transaction.objects.filter(
        classification='spend',
        idempotency_key__startswith='expense-',
    ).update(classification='', spend_category='', description='', notes='')


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0003_seed_builtin_categories'),
        ('ledger', '0004_transaction_enrichment_fields'),
    ]

    operations = [
        migrations.RunPython(backfill_expense_classifications, reverse_backfill),
    ]
