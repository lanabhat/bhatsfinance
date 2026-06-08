from rest_framework import viewsets

from tax.models import TaxProjection, TaxRecord
from tax.serializers import TaxProjectionSerializer, TaxRecordSerializer


class TaxRecordViewSet(viewsets.ModelViewSet):
    queryset = TaxRecord.objects.select_related('household', 'member').all()
    serializer_class = TaxRecordSerializer
    filterset_fields = ['household', 'member', 'financial_year', 'record_type']


class TaxProjectionViewSet(viewsets.ModelViewSet):
    queryset = TaxProjection.objects.select_related('household', 'member').all()
    serializer_class = TaxProjectionSerializer
    filterset_fields = ['household', 'member', 'financial_year']

# Create your views here.
