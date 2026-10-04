from datetime import date

from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from fund_data.mfapi_client import MfApiError
from fund_data.nav_sources import search_schemes
from fund_data.models import ExternalFund
from fund_data.serializers import ExternalFundSerializer
from fund_data.services import compute_benchmark_comparison, compute_fund_risk_metrics


class ExternalFundViewSet(viewsets.ModelViewSet):
    queryset = ExternalFund.objects.select_related('investment').all()
    serializer_class = ExternalFundSerializer
    filterset_fields = ['investment']


class FundSearchView(APIView):
    """Server-side proxy to scheme search (mfapi.in + AMFI SIFs), so the external dependency
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


class FundMatchSuggestionsView(APIView):
    """Suggested mfapi.in scheme for every MF/SIP fund not yet linked to a NAV source.
    Nothing is linked here — the user confirms via FundLinkBulkView."""

    def get(self, request):
        from functools import lru_cache

        from fund_data.matching import suggest_scheme
        from instruments.models import Instrument, Investment

        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        unlinked = (
            Investment.objects
            .filter(
                instrument__household_id=household_id,
                instrument__instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP],
                instrument__is_active=True,
                external_fund__isnull=True,
            )
            .select_related('member')
            .order_by('name', 'id')
        )
        cached_search = lru_cache(maxsize=None)(search_schemes)
        suggestions_by_name: dict[str, dict] = {}
        rows = []
        for inv in unlinked:
            if inv.name not in suggestions_by_name:
                suggestions_by_name[inv.name] = suggest_scheme(inv.name, search=cached_search)
            rows.append({
                'investment_id': inv.id,
                'name': inv.name,
                'folio_no': inv.folio_no,
                'member_name': inv.member.full_name if inv.member else None,
                **suggestions_by_name[inv.name],
            })
        return Response({'suggestions': rows})


class FundLinkBulkView(APIView):
    """Link several funds to their confirmed mfapi.in schemes in one call.
    Body: {"household_id": N, "links": [{"investment": id, "scheme_code": "120505", "scheme_name": "..."}]}"""

    def post(self, request):
        from instruments.models import Investment

        household_id = request.data.get('household_id')
        links = request.data.get('links') or []
        if not household_id or not isinstance(links, list) or not links:
            return Response({'detail': 'household_id and a non-empty links list are required.'}, status=status.HTTP_400_BAD_REQUEST)

        investments = {
            inv.id: inv for inv in Investment.objects.filter(
                instrument__household_id=household_id, id__in=[l.get('investment') for l in links],
            )
        }
        from django.db import transaction

        linked = 0
        with transaction.atomic():
            for link in links:
                inv = investments.get(link.get('investment'))
                scheme_code = str(link.get('scheme_code') or '').strip()
                if inv is None or not scheme_code:
                    continue
                ExternalFund.objects.update_or_create(
                    investment=inv,
                    defaults={'mfapi_scheme_code': scheme_code, 'scheme_name': str(link.get('scheme_name') or '')[:255]},
                )
                linked += 1
        return Response({'linked': linked})


class FundRefreshView(APIView):
    """Pull the latest NAVs for a household's linked funds and value them now —
    the on-demand version of the daily_refresh command's fund steps."""

    def post(self, request):
        from fund_data.navs import sync_navs, write_nav_snapshots

        household_id = request.data.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        synced = sync_navs(household_id=int(household_id), include_benchmarks=False, log=lambda *_: None)
        valued = write_nav_snapshots(household_id=int(household_id))
        return Response({**synced, **valued})


class MarketPriceRefreshView(APIView):
    """Bring a household's market-priced holdings up to date now — the on-demand
    version of daily_refresh's price steps: link demat funds by ISIN, fetch NAVs and
    value linked funds, then value listed equities at the latest NSE close.
    A failing source is reported in `errors` without blocking the others."""

    def post(self, request):
        from fund_data.equity_prices import link_funds_by_isin, write_equity_snapshots
        from fund_data.navs import sync_navs, write_nav_snapshots

        household_id = request.data.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        household_id = int(household_id)

        errors: list[str] = []
        linked: list[str] = []
        try:
            linked = link_funds_by_isin(household_id)['linked']
        except MfApiError as exc:
            errors.append(str(exc))
        synced = sync_navs(household_id=household_id, include_benchmarks=False, log=lambda *_: None)
        funds = write_nav_snapshots(household_id=household_id)
        equities = None
        try:
            equities = write_equity_snapshots(household_id=household_id)
        except MfApiError as exc:
            errors.append(str(exc))
        return Response({
            'funds_linked': linked,
            'funds': {**synced, **funds},
            'equities': equities,
            'errors': errors,
        })


class FundComparisonView(APIView):
    """One row per MF/SIP fund (an Investment under the household's shared
    "Mutual Fund" Instrument shell) or equity holding (still its own
    Instrument). risk_metrics/benchmark_comparison/XIRR are computed per
    Investment for MF/SIP, per Instrument for equity — matching how
    ExternalFund/FundClassification and compute_xirr() are keyed post the
    Investment redesign."""

    def get(self, request):
        from instruments.models import Instrument, Investment

        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()

        from insights.overlap import compute_portfolio_diversification
        from insights.services import compute_xirr

        investments = Investment.objects.filter(
            instrument__household_id=household_id,
            instrument__instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP],
        ).select_related('mf_details', 'external_fund')
        equities = Instrument.objects.filter(
            household_id=household_id, instrument_type=Instrument.InstrumentType.EQUITY,
        )

        diversification = compute_portfolio_diversification(int(household_id), as_of)
        overlap_by_holding: dict[tuple[str, int], list] = {}
        for pair in diversification['pairs']:
            a_key = ('investment', pair['investment_a_id']) if pair['investment_a_id'] else ('instrument', pair['instrument_a_id'])
            b_key = ('investment', pair['investment_b_id']) if pair['investment_b_id'] else ('instrument', pair['instrument_b_id'])
            overlap_by_holding.setdefault(a_key, []).append(float(pair['overlap_percent']))
            overlap_by_holding.setdefault(b_key, []).append(float(pair['overlap_percent']))

        rows = []
        for inv in investments:
            mf_details = getattr(inv, 'mf_details', None)
            risk_metrics = None
            benchmark_comparison = None
            if hasattr(inv, 'external_fund'):
                risk_metrics = compute_fund_risk_metrics(inv.id, int(household_id))
                benchmark_comparison = compute_benchmark_comparison(inv.id, as_of)

            max_overlap = max(overlap_by_holding.get(('investment', inv.id), [0]), default=0)

            rows.append({
                'instrument_id': inv.instrument_id,
                'investment_id': inv.id,
                'instrument_name': inv.name,
                'fund_category': mf_details.fund_category if mf_details else '',
                'expense_ratio': str(mf_details.expense_ratio) if mf_details and mf_details.expense_ratio is not None else None,
                'xirr_percent': compute_xirr(int(household_id), as_of, investment_id=inv.id),
                'max_overlap_percent': max_overlap,
                'linked_to_nav_source': hasattr(inv, 'external_fund'),
                'risk_metrics': risk_metrics,
                'benchmark_comparison': benchmark_comparison,
            })

        for inst in equities:
            max_overlap = max(overlap_by_holding.get(('instrument', inst.id), [0]), default=0)
            rows.append({
                'instrument_id': inst.id,
                'investment_id': None,
                'instrument_name': inst.name,
                'fund_category': '',
                'expense_ratio': None,
                'xirr_percent': compute_xirr(int(household_id), as_of, instrument_id=inst.id),
                'max_overlap_percent': max_overlap,
                'linked_to_nav_source': False,
                'risk_metrics': None,
                'benchmark_comparison': None,
            })

        return Response({'as_of': as_of, 'rows': rows})
