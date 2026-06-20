from datetime import date, timedelta
from decimal import Decimal

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from insights.services import compute_allocation, compute_cashflow, compute_category_breakdown, compute_holdings, compute_holdings_history, compute_member_accounts, compute_members_networth, compute_networth, compute_spend_analytics, compute_xirr


def _get_member_id(request):
    mid = request.query_params.get('member_id')
    return int(mid) if mid else None


class HoldingsView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()
        member_id = _get_member_id(request)
        holdings = compute_holdings(int(household_id), as_of, member_id)
        accounts = compute_member_accounts(int(household_id), as_of, member_id) if member_id else []
        return Response({'as_of': as_of, 'holdings': holdings, 'accounts': accounts})


class NetWorthView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()
        networth = compute_networth(int(household_id), as_of, _get_member_id(request))
        return Response({'as_of': as_of, 'networth': str(networth.quantize(Decimal('0.01')))})


class AllocationView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()
        return Response({'as_of': as_of, 'allocation': compute_allocation(int(household_id), as_of)})


class XIRRView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()
        instrument_id = request.query_params.get('instrument_id')
        xirr = compute_xirr(int(household_id), as_of, int(instrument_id) if instrument_id else None)
        return Response({'as_of': as_of, 'xirr': xirr})

class CashFlowView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        year = int(request.query_params.get('year', date.today().year))
        month = request.query_params.get('month')
        return Response({'cashflow': compute_cashflow(int(household_id), year, int(month) if month else None)})


class NetWorthHistoryView(APIView):
    def get(self, request):
        from valuations.models import NetWorthSnapshot
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        snapshots = NetWorthSnapshot.objects.filter(
            household_id=int(household_id)
        ).order_by('snapshot_date')
        points = [
            {'date': s.snapshot_date.isoformat(), 'networth': float(s.net_worth)}
            for s in snapshots
        ]
        return Response({'history': points})

class CategoryBreakdownView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()
        return Response({'breakdown': compute_category_breakdown(int(household_id), as_of, _get_member_id(request))})


class SpendAnalyticsView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        months = int(request.query_params.get('months', 12))
        classification = request.query_params.get('classification') or None
        return Response(compute_spend_analytics(int(household_id), months, classification))


class MembersNetWorthView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') else date.today()
        return Response({'members': compute_members_networth(int(household_id), as_of)})


class HoldingsHistoryView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        instrument_type = request.query_params.get('instrument_type') or None
        member_id = _get_member_id(request)
        history = compute_holdings_history(int(household_id), instrument_type, member_id)
        return Response({'history': history})
