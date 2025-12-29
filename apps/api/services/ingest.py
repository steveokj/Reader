import io
import posixpath
import re
import zipfile
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import urlopen
from urllib.error import URLError
import xml.etree.ElementTree as ET

from .documents import create_document


class _HTMLTextExtractor(HTMLParser):
    _BLOCK_TAGS = {
        "p",
        "div",
        "section",
        "article",
        "header",
        "footer",
        "li",
        "ul",
        "ol",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "pre",
    }

    def __init__(self) -> None:
        super().__init__()
        self._current: List[str] = []
        self._paragraphs: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        if tag == "br":
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in self._BLOCK_TAGS:
            self._flush()

    def handle_data(self, data: str) -> None:
        if data and data.strip():
            self._current.append(data.strip())

    def _flush(self) -> None:
        if not self._current:
            return
        text = " ".join(self._current).strip()
        if text:
            self._paragraphs.append(text)
        self._current = []

    def get_text(self) -> str:
        self._flush()
        return "\n\n".join(self._paragraphs)


def _replace_images(html: str) -> str:
    def repl(match: re.Match[str]) -> str:
        tag = match.group(0)
        alt_match = re.search(r'alt=[\"\\\'](.*?)[\"\\\']', tag, re.IGNORECASE)
        src_match = re.search(r'src=[\"\\\'](.*?)[\"\\\']', tag, re.IGNORECASE)
        alt = alt_match.group(1).strip() if alt_match else ""
        src = src_match.group(1).strip() if src_match else ""
        label = alt or src or "image"
        return f"<p>[Image: {label}]</p>"

    return re.sub(r"<img[^>]*>", repl, html, flags=re.IGNORECASE)


def _strip_tags_fallback(html: str) -> str:
    cleaned = re.sub(r"<(script|style)[^>]*>.*?</\\1>", "", html, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = unescape(cleaned)
    cleaned = re.sub(r"\\s+", " ", cleaned)
    return cleaned.strip()


def _extract_text_from_html(html: str) -> str:
    html = _replace_images(html)
    parser = _HTMLTextExtractor()
    parser.feed(html)
    text = parser.get_text()
    if text.strip():
        return text
    return _strip_tags_fallback(html)


def _decode_html_bytes(data: bytes) -> str:
    head = data[:1000]
    encoding_match = re.search(br'encoding=[\"\\\']([^\"\\\']+)[\"\\\']', head)
    if encoding_match:
        encoding = encoding_match.group(1).decode("ascii", errors="ignore")
        try:
            return data.decode(encoding, errors="ignore")
        except LookupError:
            pass
    charset_match = re.search(br'charset=([A-Za-z0-9_\\-]+)', head, re.IGNORECASE)
    if charset_match:
        encoding = charset_match.group(1).decode("ascii", errors="ignore")
        try:
            return data.decode(encoding, errors="ignore")
        except LookupError:
            pass
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def _extract_title_from_html(html: str) -> Optional[str]:
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    title = re.sub(r"\s+", " ", match.group(1)).strip()
    return title or None


def _local_name(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _parse_opf(opf_bytes: bytes) -> Tuple[Optional[str], Dict[str, Dict[str, str]], List[str]]:
    root = ET.fromstring(opf_bytes)
    metadata = root.find(".//{*}metadata")
    title: Optional[str] = None
    if metadata is not None:
        for child in metadata:
            if _local_name(child.tag) == "title":
                text = "".join(child.itertext()).strip()
                if text:
                    title = text
                    break

    manifest: Dict[str, Dict[str, str]] = {}
    manifest_el = root.find(".//{*}manifest")
    if manifest_el is not None:
        for item in manifest_el.findall("{*}item"):
            item_id = item.get("id")
            href = item.get("href")
            media_type = item.get("media-type")
            if item_id and href and media_type:
                manifest[item_id] = {"href": href, "media_type": media_type}

    spine_ids: List[str] = []
    spine_el = root.find(".//{*}spine")
    if spine_el is not None:
        for itemref in spine_el.findall("{*}itemref"):
            idref = itemref.get("idref")
            if idref:
                spine_ids.append(idref)

    return title, manifest, spine_ids


def ingest_epub(conn, file, title: Optional[str] = None) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    epub_bytes = file.file.read()
    if not epub_bytes:
        raise ValueError("Empty EPUB file.")

    with zipfile.ZipFile(io.BytesIO(epub_bytes)) as zf:
        try:
            container_xml = zf.read("META-INF/container.xml")
        except KeyError as exc:
            raise ValueError("Invalid EPUB container.") from exc

        container_root = ET.fromstring(container_xml)
        rootfile_el = container_root.find(".//{*}rootfile")
        if rootfile_el is None:
            raise ValueError("Invalid EPUB container.")
        opf_path = rootfile_el.get("full-path")
        if not opf_path:
            raise ValueError("Invalid EPUB package path.")

        opf_bytes = zf.read(opf_path)
        epub_title, manifest, spine_ids = _parse_opf(opf_bytes)

        base_dir = posixpath.dirname(opf_path)
        sections: List[Dict[str, Any]] = []
        section_index = 0
        for spine_id in spine_ids:
            item = manifest.get(spine_id)
            if not item:
                continue
            media_type = item.get("media_type", "")
            if media_type not in {"application/xhtml+xml", "text/html", "application/xml"}:
                continue
            href = item.get("href")
            if not href:
                continue
            item_path = posixpath.join(base_dir, href) if base_dir else href
            try:
                html_bytes = zf.read(item_path)
            except KeyError:
                continue
            html = _decode_html_bytes(html_bytes)
            content_text = _extract_text_from_html(html)
            if not content_text.strip():
                continue
            section_title = _extract_title_from_html(html) or f"Section {section_index + 1}"
            sections.append(
                {
                    "section_key": str(section_index),
                    "title": section_title,
                    "content_text": content_text,
                }
            )
            section_index += 1

    if not sections:
        raise ValueError("No readable sections found in EPUB.")

    doc_title = title or epub_title or (file.filename or "Untitled EPUB")
    payload = {
        "title": doc_title,
        "source_type": "epub",
        "source_ref": file.filename,
        "sections": sections,
    }
    return create_document(conn, payload)


def ingest_article(conn, payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    title = payload.get("title")
    url = payload.get("url")
    text = payload.get("text")

    if not url and not text:
        raise ValueError("Provide a URL or pasted text.")

    content_text = ""
    derived_title: Optional[str] = None

    if text:
        content_text = text.strip()
    if url and not content_text:
        try:
            with urlopen(url) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                html = response.read().decode(charset, errors="ignore")
        except URLError as exc:
            raise ValueError("Unable to fetch article URL.") from exc
        derived_title = _extract_title_from_html(html)
        content_text = _extract_text_from_html(html)

    if not content_text.strip():
        raise ValueError("No readable content found.")

    doc_title = title or derived_title or (url or "Untitled Article")
    payload = {
        "title": doc_title,
        "source_type": "article",
        "source_ref": url,
        "sections": [
            {
                "section_key": "0",
                "title": "Article",
                "content_text": content_text,
            }
        ],
    }
    return create_document(conn, payload)
