from datetime import date

from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from valuations.models import ValuationSnapshot
from valuations.serializers import ValuationSnapshotSerializer
from valuations.services import bulk_snapshot


class ValuationSnapshotViewSet(viewsets.ModelViewSet):
    queryset = ValuationSnapshot.objects.select_related('household', 'account', 'instrument').all()
    serializer_class = ValuationSnapshotSerializer
    filterset_fields = ['household', 'account', 'instrument', 'valuation_date', 'source']


class BulkSnapshotView(APIView):
    def post(self, request):
        household_id = request.data.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of_str = request.data.get('as_of')
        as_of = date.fromisoformat(as_of_str) if as_of_str else date.today()
        result = bulk_snapshot(int(household_id), as_of)
        return Response(result, status=status.HTTP_201_CREATED)

# Create your views here.
