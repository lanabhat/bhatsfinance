import csv
import io
import json


def parse_uploaded_file(file_bytes: bytes, filename: str, file_type: str) -> dict:
    """
    Parse CSV, Excel, PDF, or JSON into { columns: [...], rows: [{...}] }.
    Returns at most 500 rows. All values are converted to strings.
    """
    file_type = file_type.lower()

    if file_type == 'csv':
        return _parse_csv(file_bytes)
    if file_type in ('excel', 'xlsx', 'xls'):
        return _parse_excel(file_bytes)
    if file_type == 'pdf':
        return _parse_pdf(file_bytes)
    if file_type == 'json':
        return _parse_json(file_bytes)

    # fallback: try to guess from filename extension
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext == 'csv':
        return _parse_csv(file_bytes)
    if ext in ('xlsx', 'xls'):
        return _parse_excel(file_bytes)
    if ext == 'pdf':
        return _parse_pdf(file_bytes)
    if ext == 'json':
        return _parse_json(file_bytes)

    raise ValueError(f"Unsupported file type: {file_type or ext!r}")


def _stringify(v) -> str:
    if v is None:
        return ''
    return str(v).strip()


def _normalise(columns: list, rows: list) -> dict:
    columns = [str(c).strip() for c in columns if str(c).strip()]
    normalised = []
    for row in rows[:500]:
        normalised.append({col: _stringify(row.get(col, '')) for col in columns})
    return {'columns': columns, 'rows': normalised}


def _parse_csv(file_bytes: bytes) -> dict:
    text = file_bytes.decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    columns = list(reader.fieldnames or (rows[0].keys() if rows else []))
    return _normalise(columns, rows)


def _parse_excel(file_bytes: bytes) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        return {'columns': [], 'rows': []}
    headers = [str(c).strip() if c is not None else f'col_{i}' for i, c in enumerate(all_rows[0])]
    rows = []
    for raw in all_rows[1:]:
        rows.append({h: _stringify(v) for h, v in zip(headers, raw)})
    return _normalise(headers, rows)


def _parse_pdf(file_bytes: bytes) -> dict:
    import pdfplumber
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if table and len(table) > 1:
                headers = [str(c).strip() if c else f'col_{i}' for i, c in enumerate(table[0])]
                rows = []
                for raw in table[1:]:
                    rows.append({h: _stringify(v) for h, v in zip(headers, raw)})
                return _normalise(headers, rows)
    return {'columns': [], 'rows': []}


def _parse_json(file_bytes: bytes) -> dict:
    text = file_bytes.decode('utf-8-sig', errors='replace')
    data = json.loads(text)

    # top-level list of objects
    if isinstance(data, list) and data and isinstance(data[0], dict):
        columns = list(data[0].keys())
        rows = [{k: _stringify(v) for k, v in item.items()} for item in data if isinstance(item, dict)]
        return _normalise(columns, rows)

    # top-level dict — find the first list-valued key
    if isinstance(data, dict):
        for key, val in data.items():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                columns = list(val[0].keys())
                rows = [{k: _stringify(v) for k, v in item.items()} for item in val if isinstance(item, dict)]
                return _normalise(columns, rows)

    raise ValueError("JSON must be an array of objects or a dict containing an array of objects")
