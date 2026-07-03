"""
Decrypt password-protected PDFs and extract their text.

pdfplumber cannot open encrypted PDFs directly, so we use pikepdf to decrypt
into an in-memory stream first, then hand that to pdfplumber for extraction.
"""
import io


class IncorrectPasswordError(Exception):
    pass


def decrypt_and_extract_text(file_bytes: bytes, password: str | None) -> str:
    import pikepdf
    import pdfplumber

    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes), password=password or "")
    except pikepdf.PasswordError:
        raise IncorrectPasswordError("Incorrect password for this PDF.")
    except Exception as e:
        raise ValueError(f"Could not read PDF: {e}")

    try:
        buffer = io.BytesIO()
        pdf.save(buffer)
        buffer.seek(0)
    finally:
        pdf.close()

    try:
        with pdfplumber.open(buffer) as doc:
            pages_text = [page.extract_text() or "" for page in doc.pages]
        return "\n".join(pages_text)
    except Exception as e:
        raise ValueError(f"Could not read PDF: {e}")
