"""Exception domain + kode error sesuai spec."""


class OcrError(Exception):
    """Error yang dipetakan ke envelope error API.

    code: salah satu dari INVALID_FILE, FILE_TOO_LARGE, OCR_FAILED,
          BEDROCK_ERROR, RATE_LIMITED.
    """

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        # Metrik LLM opsional (diisi service OCR untuk tracing meski gagal).
        self.meta: dict = {}
        super().__init__(message)


def invalid_file(message: str = "File tidak valid atau bukan gambar.") -> OcrError:
    return OcrError("INVALID_FILE", message, status_code=400)


def file_too_large(message: str) -> OcrError:
    return OcrError("FILE_TOO_LARGE", message, status_code=413)


def ocr_failed(message: str = "Gambar tidak terbaca sebagai KTP.") -> OcrError:
    return OcrError("OCR_FAILED", message, status_code=422)


def bedrock_error(message: str = "Gagal memanggil layanan OCR.") -> OcrError:
    return OcrError("BEDROCK_ERROR", message, status_code=502)


def rate_limited(message: str = "Terlalu banyak permintaan, coba lagi.") -> OcrError:
    return OcrError("RATE_LIMITED", message, status_code=429)
