import io
import os
import posixpath
import re
import uuid
import zipfile
from html import unescape, escape
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple, Set
from urllib.request import urlopen
from urllib.error import URLError
from urllib.parse import unquote, quote, urljoin
import xml.etree.ElementTree as ET

from .documents import create_document

MEDIA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "media"))
EPUB_MEDIA_DIR = os.path.join(MEDIA_ROOT, "epub")


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

_ALLOWED_TAGS = {
    "p",
    "div",
    "section",
    "article",
    "header",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "pre",
    "code",
    "ul",
    "ol",
    "li",
    "em",
    "strong",
    "b",
    "i",
    "u",
    "span",
    "sup",
    "sub",
    "a",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "br",
    "hr",
}

_VOID_TAGS = {"img", "br", "hr"}
_BLOCK_TAGS = {
    "p",
    "div",
    "section",
    "article",
    "header",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "pre",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
}
_SKIP_CONTENT_TAGS = {"script", "style"}
_UNWRAP_TAGS = {"html", "head", "body"}
_PRESERVE_WS_TAGS = {"pre", "code"}

_ALLOWED_ATTRS: Dict[str, Set[str]] = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
    "th": {"colspan", "rowspan"},
    "td": {"colspan", "rowspan"},
}


class _HTMLSanitizer(HTMLParser):
    def __init__(self, resolve_src):
        super().__init__(convert_charrefs=True)
        self._resolve_src = resolve_src
        self._html_parts: List[str] = []
        self._text_parts: List[str] = []
        self._skip_stack: List[str] = []
        self._preserve_ws = 0
        self._last_text_char: Optional[str] = None

    def _emit_text(self, text: str) -> None:
        if not text:
            return
        if self._last_text_char is None:
            text = text.lstrip()
        elif self._last_text_char.isspace():
            text = text.lstrip()
        if not text:
            return
        self._html_parts.append(escape(text, quote=False))
        self._text_parts.append(text)
        self._last_text_char = text[-1]

    def _append_space(self) -> None:
        if self._last_text_char is None or self._last_text_char.isspace():
            return
        self._emit_text(" ")

    def _append_block_break(self) -> None:
        if self._last_text_char is None:
            return
        if self._last_text_char != "\n":
            self._emit_text("\n")

    def _append_text(self, text: str) -> None:
        if not text:
            return
        if self._preserve_ws > 0:
            self._emit_text(text)
            return
        normalized = re.sub(r"\s+", " ", text)
        if not normalized.strip():
            self._append_space()
            return
        self._emit_text(normalized)

    def _sanitize_attrs(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> str:
        allowed = _ALLOWED_ATTRS.get(tag, set())
        safe_attrs: List[Tuple[str, str]] = []
        for name, value in attrs:
            if not name:
                continue
            key = name.lower()
            if key.startswith("on") or key == "style":
                continue
            if key not in allowed:
                continue
            if value is None:
                continue
            cleaned = value.strip()
            if not cleaned:
                continue
            if key == "href":
                if cleaned.lower().startswith("javascript:"):
                    continue
            if key == "src":
                resolved = self._resolve_src(cleaned)
                if not resolved:
                    continue
                cleaned = resolved
            safe_attrs.append((key, cleaned))

        if not safe_attrs:
            return ""
        return "".join(
            f' {name}="{escape(val, quote=True)}"' for name, val in safe_attrs if val is not None
        )

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        if self._skip_stack:
            if tag in _SKIP_CONTENT_TAGS:
                self._skip_stack.append(tag)
            return
        if tag in _SKIP_CONTENT_TAGS:
            self._skip_stack.append(tag)
            return
        if tag in _UNWRAP_TAGS:
            return
        if tag not in _ALLOWED_TAGS:
            return

        if tag in _PRESERVE_WS_TAGS:
            self._preserve_ws += 1

        attrs_text = self._sanitize_attrs(tag, attrs)
        if tag in _VOID_TAGS:
            self._html_parts.append(f"<{tag}{attrs_text}>")
            if tag in {"br", "hr"}:
                self._append_block_break()
            return

        self._html_parts.append(f"<{tag}{attrs_text}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._skip_stack:
            if self._skip_stack and self._skip_stack[-1] == tag:
                self._skip_stack.pop()
            return
        if tag in _UNWRAP_TAGS or tag not in _ALLOWED_TAGS or tag in _VOID_TAGS:
            return

        if tag in _PRESERVE_WS_TAGS:
            self._preserve_ws = max(0, self._preserve_ws - 1)

        self._html_parts.append(f"</{tag}>")
        if tag in _BLOCK_TAGS:
            self._append_block_break()

    def handle_startendtag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_data(self, data: str) -> None:
        if self._skip_stack:
            return
        self._append_text(data)

    def handle_decl(self, decl: str) -> None:
        return

    def get_html(self) -> str:
        html = "".join(self._html_parts)
        return html.strip()

    def get_text(self) -> str:
        text = "".join(self._text_parts)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def _sanitize_html(html: str, resolve_src) -> Tuple[str, str]:
    sanitizer = _HTMLSanitizer(resolve_src)
    sanitizer.feed(html)
    sanitizer.close()
    return sanitizer.get_html(), sanitizer.get_text()


def _plain_text_to_html(text: str) -> str:
    paragraphs = [para.strip() for para in re.split(r"\n\s*\n", text) if para.strip()]
    html_paragraphs = []
    for paragraph in paragraphs:
        lines = [escape(line, quote=False) for line in paragraph.splitlines()]
        html_paragraphs.append(f"<p>{'<br>'.join(lines)}</p>")
    return "\n".join(html_paragraphs)


def _resolve_epub_asset(
    zf: zipfile.ZipFile,
    asset_dir: str,
    asset_root: str,
    asset_cache: Dict[str, str],
    base_dir: str,
    src: str,
) -> Optional[str]:
    if not src:
        return None
    if src.startswith("data:"):
        return src
    if re.match(r"^https?://", src, re.IGNORECASE):
        return src

    cleaned = unquote(src.split("#", 1)[0].split("?", 1)[0])
    resolved = posixpath.normpath(posixpath.join(base_dir, cleaned))
    resolved = resolved.lstrip("/")
    if resolved.startswith(".."):
        return None

    if resolved in asset_cache:
        return asset_cache[resolved]

    try:
        data = zf.read(resolved)
    except KeyError:
        return None

    safe_rel = resolved
    output_path = os.path.join(asset_dir, *safe_rel.split("/"))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as handle:
        handle.write(data)

    url_path = quote(safe_rel, safe="/")
    url = f"/media/epub/{asset_root}/{url_path}"
    asset_cache[resolved] = url
    return url


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


def _extract_heading_from_html(html: str) -> Optional[str]:
    match = re.search(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    heading = re.sub(r"<[^>]+>", " ", match.group(1))
    heading = re.sub(r"\s+", " ", heading).strip()
    return heading or None


def _rewrite_svg_images(html: str) -> str:
    def repl(match: re.Match[str]) -> str:
        tag = match.group(0)
        href_match = re.search(
            r'(?:xlink:href|href)=[\"\'](.*?)[\"\']', tag, re.IGNORECASE
        )
        src = href_match.group(1).strip() if href_match else ""
        if not src:
            return ""
        return f'<img src="{src}">'

    return re.sub(r"<image[^>]*>", repl, html, flags=re.IGNORECASE)


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
        os.makedirs(EPUB_MEDIA_DIR, exist_ok=True)
        asset_root = uuid.uuid4().hex
        asset_dir = os.path.join(EPUB_MEDIA_DIR, asset_root)
        os.makedirs(asset_dir, exist_ok=True)
        asset_cache: Dict[str, str] = {}
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
            html = _rewrite_svg_images(html)
            html_dir = posixpath.dirname(item_path)

            def resolve_src(src: str) -> Optional[str]:
                return _resolve_epub_asset(zf, asset_dir, asset_root, asset_cache, html_dir, src)

            content_html, content_text = _sanitize_html(html, resolve_src)
            if not content_text.strip() and not content_html.strip():
                continue
            section_title = (
                _extract_title_from_html(html)
                or _extract_heading_from_html(html)
                or f"Section {section_index + 1}"
            )
            sections.append(
                {
                    "section_key": str(section_index),
                    "title": section_title,
                    "content_text": content_text,
                    "content_html": content_html or None,
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
    content_html: Optional[str] = None
    derived_title: Optional[str] = None

    if text:
        content_text = text.strip()
        if content_text:
            content_html = _plain_text_to_html(content_text)
    if url and not content_text:
        try:
            with urlopen(url) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                html = response.read().decode(charset, errors="ignore")
        except URLError as exc:
            raise ValueError("Unable to fetch article URL.") from exc
        derived_title = _extract_title_from_html(html)

        def resolve_article_src(src: str) -> Optional[str]:
            if not src:
                return None
            if src.startswith("data:") or re.match(r"^https?://", src, re.IGNORECASE):
                return src
            if url:
                return urljoin(url, src)
            return None

        content_html, content_text = _sanitize_html(html, resolve_article_src)

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
                "content_html": content_html or None,
            }
        ],
    }
    return create_document(conn, payload)
