from datetime import date

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView


class StatementPreviewView(APIView):
    """Step 1: return current balance + in-range transactions per account, for the frontend to render a checkbox list and live-recompute the opening balance."""

    def post(self, request):
        from core.models import Household
        from instruments.models import Account
        from reports.services import get_statement_data

        data = request.data
        household_id = data.get('household_id')
        account_ids = data.get('account_ids') or []
        start_date = data.get('start_date')
        end_date = data.get('end_date')

        if not household_id:
            return Response({'error': 'household_id is required'}, status=400)
        if not account_ids:
            return Response({'error': 'account_ids is required'}, status=400)
        if not start_date or not end_date:
            return Response({'error': 'start_date and end_date are required'}, status=400)

        try:
            household = Household.objects.get(pk=int(household_id))
        except Household.DoesNotExist:
            return Response({'error': 'Household not found'}, status=404)

        valid_ids = list(
            Account.objects.filter(household=household, id__in=account_ids).values_list('id', flat=True)
        )
        if not valid_ids:
            return Response({'error': 'No matching accounts found for this household'}, status=400)

        try:
            start = date.fromisoformat(start_date)
            end = date.fromisoformat(end_date)
        except ValueError:
            return Response({'error': 'start_date/end_date must be YYYY-MM-DD'}, status=400)

        accounts_data = get_statement_data(household.id, valid_ids, start, end)
        return Response({'accounts': accounts_data})


class StatementExportView(APIView):
    """Step 2: build the final report (opening/closing balances honoring exclusions/overrides) and return a downloadable PDF or Excel file."""

    def post(self, request):
        from core.models import Household
        from instruments.models import Account
        from reports.services import build_statement_report, render_statement_pdf, render_statement_xlsx

        data = request.data
        household_id = data.get('household_id')
        account_ids = data.get('account_ids') or []
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        export_format = data.get('format', 'pdf')
        excluded_transaction_ids = data.get('excluded_transaction_ids') or {}
        opening_balance_overrides = data.get('opening_balance_overrides') or {}

        if not household_id:
            return Response({'error': 'household_id is required'}, status=400)
        if not account_ids:
            return Response({'error': 'account_ids is required'}, status=400)
        if not start_date or not end_date:
            return Response({'error': 'start_date and end_date are required'}, status=400)
        if export_format not in ('pdf', 'xlsx'):
            return Response({'error': "format must be 'pdf' or 'xlsx'"}, status=400)

        try:
            household = Household.objects.get(pk=int(household_id))
        except Household.DoesNotExist:
            return Response({'error': 'Household not found'}, status=404)

        valid_ids = list(
            Account.objects.filter(household=household, id__in=account_ids).values_list('id', flat=True)
        )
        if not valid_ids:
            return Response({'error': 'No matching accounts found for this household'}, status=400)

        try:
            start = date.fromisoformat(start_date)
            end = date.fromisoformat(end_date)
        except ValueError:
            return Response({'error': 'start_date/end_date must be YYYY-MM-DD'}, status=400)

        # Normalize keys to int, since JSON object keys arrive as strings.
        excluded_by_account = {
            int(k): [int(tx_id) for tx_id in v]
            for k, v in excluded_transaction_ids.items()
        }
        overrides_by_account = {int(k): v for k, v in opening_balance_overrides.items()}

        report_rows = build_statement_report(
            household.id, valid_ids, start, end,
            excluded_transaction_ids=excluded_by_account,
            opening_balance_overrides=overrides_by_account,
        )

        meta = {
            'household_name': household.name,
            'generated_on': date.today().isoformat(),
            'start_date': start.isoformat(),
            'end_date': end.isoformat(),
        }

        filename = f"account_statement_{start.isoformat()}_to_{end.isoformat()}.{export_format}"

        if export_format == 'pdf':
            content = render_statement_pdf(report_rows, meta)
            content_type = 'application/pdf'
        else:
            content = render_statement_xlsx(report_rows, meta)
            content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        response = HttpResponse(content, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
