import os
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

DEFAULT_URL = "https://www.vocabulary.com/dictionary/ether"
DEFAULT_WIDTH = 1200
DEFAULT_HEIGHT = 900

MEDIA_DIR = Path(__file__).resolve().parents[0] / "media"
LOOKUP_DIR = MEDIA_DIR / "lookup"


def main() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(dotenv_path=env_path)
    profile_dir = Path(os.getenv("LOOKUP_SNAPSHOT_PROFILE_DIR") or (LOOKUP_DIR / "profile"))
    profile_dir.mkdir(parents=True, exist_ok=True)
    url = os.getenv("LOOKUP_WARMUP_URL", DEFAULT_URL)
    width = int(os.getenv("LOOKUP_SNAPSHOT_WIDTH", DEFAULT_WIDTH))
    height = int(os.getenv("LOOKUP_SNAPSHOT_HEIGHT", DEFAULT_HEIGHT))

    print("Opening a persistent browser profile for Vocabulary.com warmup...")
    print(f"Profile dir: {profile_dir}")
    print(f"URL: {url}")
    print("Complete the Cloudflare check in the browser window.")
    print("Press Enter here after the page loads.")

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(profile_dir),
            headless=False,
            viewport={"width": width, "height": height},
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            input()
        finally:
            try:
                context.close()
            except PlaywrightError:
                # The user may have already closed the window; ignore shutdown errors.
                pass

    print("Warmup complete. You can now run snapshot requests using the same profile.")


if __name__ == "__main__":
    main()
