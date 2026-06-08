from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ingestion.serializers import CSVImportRequestSerializer
from ingestion.services import parse_and_process


class CSVImportView(APIView):
    def post(self, request):
        serializer = CSVImportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = parse_and_process(
            household_id=data['household_id'],
            filename=data.get('filename', ''),
            csv_content=data.get('csv_content'),
            rows=data.get('rows'),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class ImportPreviewView(APIView):
    """Step 1: parse an uploaded file and return columns + first 5 preview rows."""

    def post(self, request):
        from ingestion.file_parser import parse_uploaded_file

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file provided'}, status=400)

        file_type = request.data.get('file_type', '').lower()
        filename = file_obj.name or ''
        # auto-detect from extension if not supplied
        if not file_type and '.' in filename:
            ext = filename.rsplit('.', 1)[-1].lower()
            file_type = {'xlsx': 'excel', 'xls': 'excel', 'csv': 'csv',
                         'pdf': 'pdf', 'json': 'json'}.get(ext, ext)

        try:
            result = parse_uploaded_file(file_obj.read(), filename, file_type)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        return Response({
            'columns': result['columns'],
            'preview': result['rows'][:5],
            'total_rows': len(result['rows']),
            'all_rows': result['rows'],
        })


class ImportSchemasView(APIView):
    """Return field schemas for all import types (used by the frontend mapping UI)."""

    def get(self, request):
        from ingestion.import_schemas import IMPORT_SCHEMAS
        return Response(IMPORT_SCHEMAS)


class ImportApplyView(APIView):
    """Step 3: apply mapping + defaults and create model records."""

    def post(self, request):
        from ingestion.universal_importer import apply_import

        data = request.data
        household_id = data.get('household_id')
        import_type = data.get('import_type')
        rows = data.get('rows', [])
        mapping = data.get('mapping', {})
        defaults = data.get('defaults', {})

        if not household_id:
            return Response({'error': 'household_id is required'}, status=400)
        if not import_type:
            return Response({'error': 'import_type is required'}, status=400)
        if not rows:
            return Response({'error': 'rows is required'}, status=400)

        try:
            result = apply_import(
                household_id=int(household_id),
                import_type=import_type,
                rows=rows,
                mapping=mapping,
                defaults=defaults,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        return Response(result, status=201)
