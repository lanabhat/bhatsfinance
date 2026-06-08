from django.core.management.base import BaseCommand
from django.db.models import Q

from ledger.models import Transaction

OUTFLOW_TYPES = [
    Transaction.TransactionType.BUY,
    Transaction.TransactionType.WITHDRAWAL,
    Transaction.TransactionType.EMI,
    Transaction.TransactionType.TAX_PAYMENT,
    Transaction.TransactionType.PREMIUM,
]

INFLOW_TYPES = [
    Transaction.TransactionType.SELL,
    Transaction.TransactionType.DEPOSIT,
    Transaction.TransactionType.DIVIDEND,
    Transaction.TransactionType.INTEREST,
    Transaction.TransactionType.SALARY,
    Transaction.TransactionType.TAX_REFUND,
    Transaction.TransactionType.LOAN_DISBURSAL,
]


class Command(BaseCommand):
    help = 'Fix transaction direction field based on transaction_type for all existing records.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without writing to the database.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        wrong_outflow = Transaction.objects.filter(
            transaction_type__in=OUTFLOW_TYPES,
        ).exclude(direction=Transaction.Direction.OUTFLOW)

        wrong_inflow = Transaction.objects.filter(
            transaction_type__in=INFLOW_TYPES,
        ).exclude(direction=Transaction.Direction.INFLOW)

        outflow_count = wrong_outflow.count()
        inflow_count = wrong_inflow.count()

        self.stdout.write(f'Transactions with wrong direction: {outflow_count + inflow_count}')
        self.stdout.write(f'  Should be OUTFLOW but are not: {outflow_count}')
        self.stdout.write(f'  Should be INFLOW but are not:  {inflow_count}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes written.'))
            return

        if outflow_count:
            wrong_outflow.update(direction=Transaction.Direction.OUTFLOW)
        if inflow_count:
            wrong_inflow.update(direction=Transaction.Direction.INFLOW)

        self.stdout.write(self.style.SUCCESS(
            f'Fixed {outflow_count + inflow_count} transactions.'
        ))
