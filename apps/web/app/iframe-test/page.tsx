"use client";

import { useCallback, useMemo, useState } from "react";

const DEFAULT_URL = "https://www.vocabulary.com/dictionary/ether";

export default function IframeTestPage() {
  const [inputValue, setInputValue] = useState(DEFAULT_URL);
  const [frameUrl, setFrameUrl] = useState(DEFAULT_URL);
  const [frameKey, setFrameKey] = useState(0);

  const resolvedUrl = useMemo(() => {
    const trimmed = frameUrl.trim();
    return trimmed ? trimmed : DEFAULT_URL;
  }, [frameUrl]);

  const handleLoad = useCallback(() => {
    const nextUrl = inputValue.trim() || DEFAULT_URL;
    setFrameUrl(nextUrl);
    setFrameKey((prev) => prev + 1);
  }, [inputValue]);

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Test Lab</div>
        <h1 className="reader-title">Vocabulary.com Iframe Check</h1>
      </header>
      <section className="iframe-test">
        <div className="iframe-test__controls">
          <label className="iframe-test__label" htmlFor="iframe-url">
            URL to load
          </label>
          <div className="iframe-test__row">
            <input
              id="iframe-url"
              className="iframe-test__input"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={DEFAULT_URL}
              spellCheck={false}
            />
            <button type="button" className="iframe-test__button" onClick={handleLoad}>
              Load
            </button>
            <a
              className="iframe-test__link"
              href={resolvedUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
          </div>
          <p className="iframe-test__hint">
            If the frame stays blank, the site is likely blocking embeds via
            X-Frame-Options or Content-Security-Policy.
          </p>
        </div>
        <div className="iframe-test__frame-wrap">
          <iframe
            key={frameKey}
            title="Iframe test"
            src={resolvedUrl}
            className="iframe-test__frame"
          />
        </div>
      </section>
      <style jsx>{`
        .iframe-test {
          max-width: 1100px;
          margin: 24px auto 0;
          padding: 0 20px 80px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .iframe-test__controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .iframe-test__label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(31, 28, 22, 0.6);
        }
        .iframe-test__row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .iframe-test__input {
          flex: 1 1 420px;
          min-width: 260px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(31, 28, 22, 0.2);
          font-size: 14px;
          background: white;
        }
        .iframe-test__button {
          border: none;
          background: var(--reader-accent);
          color: white;
          padding: 10px 16px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 13px;
        }
        .iframe-test__link {
          border: 1px solid rgba(31, 28, 22, 0.2);
          background: transparent;
          color: var(--reader-ink);
          padding: 10px 16px;
          border-radius: 999px;
          font-size: 13px;
          text-decoration: none;
        }
        .iframe-test__hint {
          font-size: 13px;
          color: rgba(31, 28, 22, 0.6);
          margin: 0;
        }
        .iframe-test__frame-wrap {
          border: 1px solid rgba(31, 28, 22, 0.15);
          border-radius: 18px;
          overflow: hidden;
          background: #fff;
          min-height: 65vh;
        }
        .iframe-test__frame {
          width: 100%;
          height: 65vh;
          border: none;
        }
      `}</style>
    </main>
  );
}
