import django_filters
from django.db.models import Q

from ledger.models import Transaction


class TransactionFilter(django_filters.FilterSet):
    tx_date_after = django_filters.DateFilter(field_name='tx_date', lookup_expr='gte')
    tx_date_before = django_filters.DateFilter(field_name='tx_date', lookup_expr='lte')
    search = django_filters.CharFilter(method='filter_search')
    ordering = django_filters.OrderingFilter(
        fields=(
            ('tx_date', 'tx_date'),
            ('amount', 'amount'),
            ('id', 'id'),
        ),
    )

    class Meta:
        model = Transaction
        fields = ['household', 'account', 'instrument', 'member', 'source', 'transaction_type', 'classification', 'spend_category']

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
