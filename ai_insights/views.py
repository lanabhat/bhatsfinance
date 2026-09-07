from datetime import date

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_insights.gemini_client import GeminiNotConfigured
from ai_insights.models import FundClassification, FundReturnsComparison, RebalancingExplanation
from ai_insights.serializers import FundClassificationSerializer, FundReturnsComparisonSerializer, RebalancingExplanationSerializer
from ai_insights.services import apply_classifications, classify_all_funds, classify_fund, compare_fund_returns, explain_rebalancing


class ClassifyFundView(APIView):
    """POST only — never called automatically. Classifies one MF instrument via
    the Gemini API and stores/updates the cached FundClassification row."""

    def get(self, request, instrument_id):
        try:
            classification = FundClassification.objects.get(instrument_id=instrument_id)
        except FundClassification.DoesNotExist:
            return Response({'detail': 'Not yet classified.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(FundClassificationSerializer(classification).data)

    def post(self, request, instrument_id):
        from instruments.models import Instrument
        try:
            instrument = Instrument.objects.select_related('mf_details').get(pk=instrument_id)
        except Instrument.DoesNotExist:
            return Response({'detail': 'Instrument not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            classification = classify_fund(instrument)
        except GeminiNotConfigured as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(FundClassificationSerializer(classification).data, status=status.HTTP_201_CREATED)


class ClassifyAllFundsView(APIView):
    """POST only. Classifies every MF/SIP instrument in the household and
    returns proposals for review — does NOT write anything to FundClassification.
    Use ApplyClassificationsView to persist the reviewed/approved subset."""

    def post(self, request):
        household_id = request.data.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            proposals = classify_all_funds(int(household_id))
        except GeminiNotConfigured as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({'proposals': proposals})


class ApplyClassificationsView(APIView):
    """POST only. Persists only the approved rows from a classify-all-funds
    review pass. Body: {classifications: [{instrument_id, bucket,
    rule_60_40_category, reasoning, approved}, ...]}."""

    def post(self, request):
        classifications = request.data.get('classifications')
        if not classifications:
            return Response({'detail': 'classifications is required.'}, status=status.HTTP_400_BAD_REQUEST)

        applied = apply_classifications(classifications)
        return Response({'applied': applied})


class CompareFundReturnsView(APIView):
    def get(self, request, instrument_id):
        try:
            comparison = FundReturnsComparison.objects.get(instrument_id=instrument_id)
        except FundReturnsComparison.DoesNotExist:
            return Response({'detail': 'No comparison generated yet.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(FundReturnsComparisonSerializer(comparison).data)

    def post(self, request, instrument_id):
        from instruments.models import Instrument

        household_id = request.data.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            instrument = Instrument.objects.select_related('mf_details').get(pk=instrument_id)
        except Instrument.DoesNotExist:
            return Response({'detail': 'Instrument not found.'}, status=status.HTTP_404_NOT_FOUND)

        as_of = date.fromisoformat(request.data['as_of']) if request.data.get('as_of') else date.today()

        try:
            comparison = compare_fund_returns(instrument, int(household_id), as_of)
        except GeminiNotConfigured as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(FundReturnsComparisonSerializer(comparison).data, status=status.HTTP_201_CREATED)


class ExplainRebalancingView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        as_of_str = request.query_params.get('as_of')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(as_of_str) if as_of_str else date.today()
        try:
            explanation = RebalancingExplanation.objects.get(household_id=household_id, as_of_date=as_of)
        except RebalancingExplanation.DoesNotExist:
            return Response({'detail': 'No explanation generated yet for this date.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(RebalancingExplanationSerializer(explanation).data)

    def post(self, request):
        household_id = request.data.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of = date.fromisoformat(request.data['as_of']) if request.data.get('as_of') else date.today()

        try:
            explanation = explain_rebalancing(int(household_id), as_of)
        except GeminiNotConfigured as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(RebalancingExplanationSerializer(explanation).data, status=status.HTTP_201_CREATED)
