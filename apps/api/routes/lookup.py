import asyncio
import hashlib
import os
import time
import traceback
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

router = APIRouter(prefix="/lookup", tags=["lookup"])

PROVIDERS = {
    "vocabulary": {
        "host": "www.vocabulary.com",
        "template": "https://www.vocabulary.com/dictionary/{word}",
    },
    "merriam": {
        "host": "www.merriam-webster.com",
        "template": "https://www.merriam-webster.com/dictionary/{word}",
    },
}
ALLOWED_HOSTS = {
    "www.vocabulary.com",
    "vocabulary.com",
    "www.merriam-webster.com",
    "merriam-webster.com",
}
DEFAULT_VIEWPORT_WIDTH = 1200
DEFAULT_VIEWPORT_HEIGHT = 900
DEFAULT_MOBILE_WIDTH = 390
DEFAULT_MOBILE_HEIGHT = 844
DEFAULT_MOBILE_DSF = 3
DEFAULT_MOBILE_DEVICE = "iPhone 14"
DEFAULT_MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
)
SNAPSHOT_TTL_SECONDS = int(os.getenv("LOOKUP_SNAPSHOT_TTL", "86400"))
DEBUG_ERRORS = os.getenv("LOOKUP_SNAPSHOT_DEBUG", "0") == "1"
PERSISTENT_PROFILE = os.getenv("LOOKUP_SNAPSHOT_PERSISTENT", "0") == "1"
HEADLESS = os.getenv("LOOKUP_SNAPSHOT_HEADLESS", "1") != "0"
WAIT_MS = int(os.getenv("LOOKUP_SNAPSHOT_WAIT_MS", "800"))
USER_AGENT = os.getenv("LOOKUP_SNAPSHOT_USER_AGENT")
CHANNEL = os.getenv("LOOKUP_SNAPSHOT_CHANNEL")
STEALTH = os.getenv("LOOKUP_SNAPSHOT_STEALTH", "0") == "1"
WAIT_SELECTOR = os.getenv("LOOKUP_SNAPSHOT_WAIT_SELECTOR")
FORCE_MOBILE = os.getenv("LOOKUP_SNAPSHOT_MOBILE", "0") == "1"
MOBILE_WIDTH_ENV = os.getenv("LOOKUP_SNAPSHOT_MOBILE_WIDTH") or None
MOBILE_HEIGHT_ENV = os.getenv("LOOKUP_SNAPSHOT_MOBILE_HEIGHT") or None
MOBILE_DSF_ENV = os.getenv("LOOKUP_SNAPSHOT_MOBILE_DSF") or None
MOBILE_UA_ENV = os.getenv("LOOKUP_SNAPSHOT_MOBILE_UA") or None
MOBILE_WIDTH = int(MOBILE_WIDTH_ENV) if MOBILE_WIDTH_ENV else DEFAULT_MOBILE_WIDTH
MOBILE_HEIGHT = int(MOBILE_HEIGHT_ENV) if MOBILE_HEIGHT_ENV else DEFAULT_MOBILE_HEIGHT
MOBILE_DSF = float(MOBILE_DSF_ENV) if MOBILE_DSF_ENV else DEFAULT_MOBILE_DSF
MOBILE_UA = MOBILE_UA_ENV or DEFAULT_MOBILE_UA

MEDIA_DIR = Path(__file__).resolve().parents[1] / "media"
LOOKUP_DIR = MEDIA_DIR / "lookup"
LOOKUP_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_DIR = Path(os.getenv("LOOKUP_SNAPSHOT_PROFILE_DIR") or (LOOKUP_DIR / "profile"))
PROFILE_DIR_MOBILE = Path(
    os.getenv("LOOKUP_SNAPSHOT_PROFILE_DIR_MOBILE") or (PROFILE_DIR / "mobile")
)


def resolve_target_url(word: str | None, url: str | None, provider: str | None) -> str:
    if word is not None:
        trimmed = word.strip()
        if not trimmed:
            raise HTTPException(status_code=400, detail="word must not be empty.")
        selected = (provider or "vocabulary").strip().lower()
        if selected not in PROVIDERS:
            allowed = ", ".join(sorted(PROVIDERS.keys()))
            raise HTTPException(
                status_code=400,
                detail=f"provider must be one of: {allowed}",
            )
        template = PROVIDERS[selected]["template"]
        return template.format(word=quote(trimmed))

    if url is None:
        raise HTTPException(status_code=400, detail="word or url is required.")

    trimmed = url.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="url must not be empty.")

    parsed = urlparse(trimmed)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="url must include http/https and a host.")

    if parsed.netloc not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="url host is not allowed.")

    return trimmed


def build_cache_path(url: str, width: int, height: int, full_page: bool) -> Path:
    key = hashlib.sha256(
        f"{url}|{width}x{height}|{int(full_page)}".encode("utf-8")
    ).hexdigest()
    return LOOKUP_DIR / f"{key[:32]}.png"


def is_cache_fresh(path: Path) -> bool:
    if SNAPSHOT_TTL_SECONDS <= 0:
        return False
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return age < SNAPSHOT_TTL_SECONDS


def render_snapshot(
    url: str,
    cache_path: Path,
    width: int,
    height: int,
    full_page: bool,
    is_mobile: bool,
) -> None:
    launch_options = {"headless": HEADLESS}
    context_options = {"viewport": {"width": width, "height": height}}

    def apply_stealth(context, mobile: bool) -> None:
        if not STEALTH:
            return
        platform = "iPhone" if mobile else "Win32"
        vendor = "Apple Computer, Inc." if mobile else "Google Inc."
        max_touch_points = 5 if mobile else 0
        user_agent_data_line = (
            "Object.defineProperty(navigator, 'userAgentData', {get: () => undefined});"
            if mobile
            else ""
        )
        context.add_init_script(
            f"""
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
Object.defineProperty(navigator, 'platform', {{get: () => '{platform}'}});
Object.defineProperty(navigator, 'vendor', {{get: () => '{vendor}'}});
Object.defineProperty(navigator, 'maxTouchPoints', {{get: () => {max_touch_points}}});
{user_agent_data_line}
"""
        )

    def strip_client_hints(context, mobile: bool) -> None:
        if not mobile:
            return

        def handler(route, request) -> None:
            headers = dict(request.headers)
            for key in list(headers.keys()):
                if key.lower().startswith("sec-ch-"):
                    headers.pop(key, None)
            route.continue_(headers=headers)

        context.route("**/*", handler)

    def apply_mobile_viewport_override(context, mobile: bool) -> None:
        if not mobile:
            return
        context.add_init_script(
            """
(() => {
  const ensureViewport = () => {
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1';
    let style = document.getElementById('codex-viewport-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'codex-viewport-style';
      style.textContent = '@viewport { width: device-width; } @-ms-viewport { width: device-width; }';
      head.appendChild(style);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureViewport);
  } else {
    ensureViewport();
  }
})();
"""
        )

    with sync_playwright() as playwright:
        browser_name = "webkit" if is_mobile else "chromium"
        browser_type = getattr(playwright, browser_name)
        if CHANNEL and browser_name == "chromium":
            launch_options["channel"] = CHANNEL
        if is_mobile:
            device = playwright.devices.get(DEFAULT_MOBILE_DEVICE)
            if device:
                context_options = dict(device)
                context_options.pop("default_browser_type", None)
            else:
                context_options["device_scale_factor"] = MOBILE_DSF
                context_options["user_agent"] = MOBILE_UA
            context_options.setdefault("viewport", {"width": width, "height": height})
            context_options.setdefault("is_mobile", True)
            context_options.setdefault("has_touch", True)
            if MOBILE_DSF_ENV:
                context_options["device_scale_factor"] = MOBILE_DSF
            if MOBILE_UA_ENV:
                context_options["user_agent"] = MOBILE_UA
            if MOBILE_WIDTH_ENV:
                context_options["viewport"]["width"] = MOBILE_WIDTH
            if MOBILE_HEIGHT_ENV:
                context_options["viewport"]["height"] = MOBILE_HEIGHT
            if "viewport" in context_options:
                if "screen" not in context_options:
                    context_options["screen"] = dict(context_options["viewport"])
                else:
                    context_options["screen"]["width"] = context_options["viewport"]["width"]
                    context_options["screen"]["height"] = context_options["viewport"]["height"]
        elif USER_AGENT:
            context_options["user_agent"] = USER_AGENT
        if PERSISTENT_PROFILE:
            profile_dir = PROFILE_DIR_MOBILE if is_mobile else PROFILE_DIR
            profile_dir.mkdir(parents=True, exist_ok=True)
            context = browser_type.launch_persistent_context(
                str(profile_dir), **launch_options, **context_options
            )
            try:
                apply_stealth(context, is_mobile)
                strip_client_hints(context, is_mobile)
                apply_mobile_viewport_override(context, is_mobile)
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                if WAIT_SELECTOR:
                    page.wait_for_selector(WAIT_SELECTOR, timeout=20000)
                if WAIT_MS > 0:
                    page.wait_for_timeout(WAIT_MS)
                page.screenshot(path=str(cache_path), full_page=full_page)
            finally:
                context.close()
        else:
            browser = browser_type.launch(**launch_options)
            try:
                context = browser.new_context(**context_options)
                apply_stealth(context, is_mobile)
                strip_client_hints(context, is_mobile)
                apply_mobile_viewport_override(context, is_mobile)
                page = context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                if WAIT_SELECTOR:
                    page.wait_for_selector(WAIT_SELECTOR, timeout=20000)
                if WAIT_MS > 0:
                    page.wait_for_timeout(WAIT_MS)
                page.screenshot(path=str(cache_path), full_page=full_page)
            finally:
                browser.close()


@router.get("/snapshot")
async def lookup_snapshot(
    word: str | None = Query(default=None),
    url: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    width: int = Query(default=DEFAULT_VIEWPORT_WIDTH, ge=320, le=2000),
    height: int = Query(default=DEFAULT_VIEWPORT_HEIGHT, ge=320, le=2000),
    full_page: bool = Query(default=False),
    refresh: bool = Query(default=False),
):
    target_url = resolve_target_url(word, url, provider)
    use_mobile = FORCE_MOBILE
    effective_width = MOBILE_WIDTH if use_mobile else width
    effective_height = MOBILE_HEIGHT if use_mobile else height
    cache_path = build_cache_path(target_url, effective_width, effective_height, full_page)

    if refresh and cache_path.exists():
        try:
            cache_path.unlink()
        except OSError:
            pass

    if not refresh and is_cache_fresh(cache_path):
        return FileResponse(cache_path, media_type="image/png")

    try:
        await asyncio.to_thread(
            render_snapshot,
            target_url,
            cache_path,
            effective_width,
            effective_height,
            full_page,
            use_mobile,
        )
    except PlaywrightTimeoutError as exc:
        if cache_path.exists():
            try:
                cache_path.unlink()
            except OSError:
                pass
        detail = "Snapshot timed out."
        if DEBUG_ERRORS:
            detail = f"{detail} ({type(exc).__name__}: {exc})"
        raise HTTPException(status_code=504, detail=detail) from exc
    except Exception as exc:
        if cache_path.exists():
            try:
                cache_path.unlink()
            except OSError:
                pass
        if DEBUG_ERRORS:
            traceback.print_exc()
            detail = f"Snapshot failed. ({type(exc).__name__}: {exc})"
        else:
            detail = "Snapshot failed."
        raise HTTPException(status_code=502, detail=detail) from exc
    return FileResponse(cache_path, media_type="image/png")
