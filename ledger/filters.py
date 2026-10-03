import django_filters
from django.db.models import Q

from ledger.models import Transaction


class NumberInFilter(django_filters.BaseInFilter, django_filters.NumberFilter):
    """Comma-separated ids, e.g. ?member__in=1,4 — matches ANY of them."""


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    """Comma-separated values, e.g. ?classification__in=spend,income."""


class TransactionFilter(django_filters.FilterSet):
    # "Any of" variants used by the filter bar; the single-value params in Meta.fields still work.
    account__in = NumberInFilter(field_name='account', lookup_expr='in')
    member__in = NumberInFilter(field_name='member', lookup_expr='in')
    transaction_type__in = CharInFilter(field_name='transaction_type', lookup_expr='in')
    classification__in = CharInFilter(field_name='classification', lookup_expr='in')
    spend_category__in = CharInFilter(field_name='spend_category', lookup_expr='in')

    tx_date_after = django_filters.DateFilter(field_name='tx_date', lookup_expr='gte')
    tx_date_before = django_filters.DateFilter(field_name='tx_date', lookup_expr='lte')
    amount_min = django_filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount_max = django_filters.NumberFilter(field_name='amount', lookup_expr='lte')
    search = django_filters.CharFilter(method='filter_search')
    # Comma-separated tag ids; matches transactions carrying ANY of the given tags.
    tags = django_filters.CharFilter(method='filter_tags')
    # Matches the bucketing in insights.services.compute_cashflow exactly, so
    # clicking an "Income"/"Expense"/"Investment" bar on the Cash Flow chart
    # can list precisely the transactions that make up that figure.
    cashflow_bucket = django_filters.ChoiceFilter(
        choices=[('income', 'income'), ('expense', 'expense'), ('investment', 'investment'), ('savings', 'savings')],
        method='filter_cashflow_bucket',
    )
    ordering = django_filters.OrderingFilter(
        fields=(
            ('tx_date', 'tx_date'),
            ('amount', 'amount'),
            ('id', 'id'),
        ),
    )

    class Meta:
        model = Transaction
        fields = ['household', 'account', 'instrument', 'investment', 'member', 'source', 'transaction_type', 'classification', 'spend_category']

    def filter_tags(self, queryset, name, value):
        ids = [v.strip() for v in value.split(',') if v.strip()]
        if not ids:
            return queryset
        return queryset.filter(tags__id__in=ids).distinct()

    def filter_search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        q = Q(external_reference__icontains=value) | Q(description__icontains=value) | Q(notes__icontains=value)
        try:
            amount = float(value)
        except ValueError:
            amount = None
        if amount is not None:
            q |= Q(amount=amount)
        return queryset.filter(q)

    def filter_cashflow_bucket(self, queryset, name, value):
        from insights.services import CASHFLOW_EXPENSE_TYPES, CASHFLOW_INCOME_TYPES

        queryset = queryset.exclude(classification__in=[
            Transaction.Classification.INTERNAL_TRANSFER, Transaction.Classification.TRACKING,
        ])
        if value == 'income':
            return queryset.filter(transaction_type__in=CASHFLOW_INCOME_TYPES)
        if value == 'expense':
            return queryset.filter(transaction_type__in=CASHFLOW_EXPENSE_TYPES)
        if value == 'investment':
            return queryset.filter(transaction_type=Transaction.TransactionType.BUY)
        if value == 'savings':
            # Savings = income - expense - investment, so "savings" transactions
            # are every row that fed that computation (all three buckets combined).
            return queryset.filter(
                transaction_type__in=CASHFLOW_INCOME_TYPES | CASHFLOW_EXPENSE_TYPES | {Transaction.TransactionType.BUY},
            )
        return queryset
