from datetime import date

from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from fund_data.mfapi_client import MfApiError, search_schemes
from fund_data.models import ExternalFund
from fund_data.serializers import ExternalFundSerializer
from fund_data.services import compute_benchmark_comparison, compute_fund_risk_metrics


class ExternalFundViewSet(viewsets.ModelViewSet):
    queryset = ExternalFund.objects.select_related('instrument').all()
    serializer_class = ExternalFundSerializer
    filterset_fields = ['instrument']


class FundSearchView(APIView):
    """Server-side proxy to mfapi.in's scheme search, so the external dependency
    stays server-side (no CORS/rate-limit exposure to the browser)."""

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'detail': 'q query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            results = search_schemes(query)
        except MfApiError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'results': results[:25]})


class FundComparisonView(APIView):
    def get(self, request):
        from instruments.models import Instrument, MutualFundDetails

        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()

        from insights.overlap import compute_portfolio_diversification
        from insights.services import compute_xirr

        instruments = Instrument.objects.filter(
            household_id=household_id,
            instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP, Instrument.InstrumentType.EQUITY],
        ).select_related('mf_details', 'external_fund')

        diversification = compute_portfolio_diversification(int(household_id), as_of)
        overlap_by_instrument: dict[int, list] = {}
        for pair in diversification['pairs']:
            overlap_by_instrument.setdefault(pair['instrument_a_id'], []).append(float(pair['overlap_percent']))
            overlap_by_instrument.setdefault(pair['instrument_b_id'], []).append(float(pair['overlap_percent']))

        rows = []
        for inst in instruments:
            mf_details = getattr(inst, 'mf_details', None)
            risk_metrics = None
            benchmark_comparison = None
            if hasattr(inst, 'external_fund'):
                risk_metrics = compute_fund_risk_metrics(inst.id, int(household_id))
                benchmark_comparison = compute_benchmark_comparison(inst.id, as_of)

            max_overlap = max(overlap_by_instrument.get(inst.id, [0]), default=0)

            rows.append({
                'instrument_id': inst.id,
                'instrument_name': inst.name,
                'fund_category': mf_details.fund_category if mf_details else '',
                'expense_ratio': str(mf_details.expense_ratio) if mf_details and mf_details.expense_ratio is not None else None,
                'xirr_percent': compute_xirr(int(household_id), as_of, inst.id),
                'max_overlap_percent': max_overlap,
                'linked_to_nav_source': hasattr(inst, 'external_fund'),
                'risk_metrics': risk_metrics,
                'benchmark_comparison': benchmark_comparison,
            })

        return Response({'as_of': as_of, 'rows': rows})
