"""Document upload parsing + chunking for knowledge bases (Phase 4 RAG).

``parse_document`` extracts plain text from an uploaded file; ``chunk_text``
splits that text into overlapping spans whose char offsets into the *original*
parsed text are recorded on each ``knowledge_documents`` row for citations.
"""

from __future__ import annotations

import io
import mimetypes
from typing import Any

DEFAULT_CHUNK_SIZE = 800
DEFAULT_CHUNK_OVERLAP = 120
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB upload cap

_TEXT_EXTENSIONS = {".md", ".markdown", ".txt"}
_DOCX_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _decode_text(content: bytes) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("utf-8", errors="replace")


def _parse_pdf(content: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _parse_docx(content: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(content))
    return "\n".join(para.text for para in document.paragraphs)


def parse_document(
    filename: str,
    content: bytes,
    mime: str | None = None,
) -> str:
    """Extract plain text from an uploaded document.

    Supported: .pdf (pypdf), .docx (python-docx), .md/.markdown/.txt (utf-8).
    Detection prefers the filename extension and falls back to the declared
    mime type. Raises ValueError for unsupported types or corrupt files.
    """
    name = (filename or "").lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    ext = f".{ext}" if ext else ""
    mime = (mime or "").split(";")[0].strip().lower()

    if not ext:
        guessed = mimetypes.guess_extension(mime) if mime else None
        ext = guessed or ""

    try:
        if ext == ".pdf" or (not ext and mime == "application/pdf"):
            return _parse_pdf(content)
        if ext == ".docx" or (not ext and mime in _DOCX_MIMES):
            return _parse_docx(content)
        if ext in _TEXT_EXTENSIONS or (not ext and mime.startswith("text/")):
            return _decode_text(content)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Could not parse {filename or 'upload'}: {exc}") from exc

    raise ValueError(
        f"Unsupported document type for {filename or 'upload'} "
        f"(supported: .pdf, .docx, .md, .txt)"
    )


def _split_point(text: str, start: int, limit: int) -> int:
    """Choose where chunk [start..limit) should end.

    Prefer the last sentence boundary anywhere in the window; else the last
    word boundary in the back half, then any word boundary earlier; hard-split
    at ``limit`` only when no boundary exists at all (an overlong word).
    """

    def _sentence_end(at: int) -> bool:
        if text[at] not in ".!?":
            return False
        nxt = at + 1
        return nxt >= len(text) or text[nxt].isspace()

    floor = start + (limit - start) // 2
    for i in range(limit - 1, start, -1):
        if _sentence_end(i):
            return i + 1
    for i in range(limit - 1, floor - 1, -1):
        if text[i].isspace():
            return i
    for i in range(floor - 1, start, -1):
        if text[i].isspace():
            return i
    return limit


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[dict[str, Any]]:
    """Split text into overlapping chunks on sentence/word boundaries.

    Returns ``[{text, start, end}]`` where start/end are char offsets into the
    input (chunk text is stripped of surrounding whitespace; offsets cover the
    stripped span). A single word longer than ``chunk_size`` is hard-split.
    Empty/whitespace-only input returns ``[]``.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be >= 0 and < chunk_size")
    if not text or not text.strip():
        return []

    chunks: list[dict[str, Any]] = []
    n = len(text)
    start = 0
    while text[start].isspace():
        start += 1

    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            end = _split_point(text, start, end)
            while end > start and text[end - 1].isspace():
                end -= 1
        piece = text[start:end].strip()
        if piece:
            first = start
            while first < end and text[first].isspace():
                first += 1
            last = end
            while last > first and text[last - 1].isspace():
                last -= 1
            chunks.append({"text": piece, "start": first, "end": last})
        if end >= n:
            break
        prev = start
        start = max(end - overlap, prev + 1)
        # Prefer word-aligned starts, but never create a coverage gap:
        # mid-word continuation (hard splits) must resume at `start` itself.
        if not text[start].isspace() and not text[start - 1].isspace():
            boundary = start
            while boundary < n and not text[boundary].isspace():
                boundary += 1
            if boundary <= end:
                start = boundary
        while start < n and text[start].isspace():
            start += 1
    return chunks
