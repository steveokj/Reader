"use client";

import { useMemo, useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";

const DEFAULT_WORD = "ether";
const DEFAULT_PROVIDER = "merriam";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function SnapshotTestPage() {
  const apiBase = getClientApiBase();
  const [word, setWord] = useState(DEFAULT_WORD);
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [width, setWidth] = useState(String(DEFAULT_WIDTH));
  const [height, setHeight] = useState(String(DEFAULT_HEIGHT));
  const [fullPage, setFullPage] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const resolvedWord = word.trim() || DEFAULT_WORD;
  const resolvedWidth = clamp(parseInt(width, 10) || DEFAULT_WIDTH, 320, 2000);
  const resolvedHeight = clamp(parseInt(height, 10) || DEFAULT_HEIGHT, 320, 2000);

  const snapshotUrl = useMemo(() => {
    const params = new URLSearchParams({
      word: resolvedWord,
      provider,
      width: String(resolvedWidth),
      height: String(resolvedHeight),
      full_page: String(fullPage),
      v: String(refreshKey),
    });
    return `${apiBase}/lookup/snapshot?${params.toString()}`;
  }, [apiBase, fullPage, refreshKey, resolvedHeight, resolvedWidth, resolvedWord]);

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Test Lab</div>
        <h1 className="reader-title">Vocabulary Snapshot Test</h1>
      </header>
      <section className="snapshot-test">
        <div className="snapshot-test__controls">
          <label className="snapshot-test__label" htmlFor="snapshot-word">
            Word
          </label>
          <div className="snapshot-test__row">
            <input
              id="snapshot-word"
              className="snapshot-test__input"
              value={word}
              onChange={(event) => setWord(event.target.value)}
              placeholder={DEFAULT_WORD}
              spellCheck={false}
            />
            <select
              className="snapshot-test__select"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              aria-label="Dictionary provider"
            >
              <option value="vocabulary">Vocabulary.com</option>
              <option value="merriam">Merriam-Webster</option>
            </select>
            <input
              className="snapshot-test__input snapshot-test__input--small"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              inputMode="numeric"
              placeholder={String(DEFAULT_WIDTH)}
              aria-label="Viewport width"
            />
            <input
              className="snapshot-test__input snapshot-test__input--small"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              inputMode="numeric"
              placeholder={String(DEFAULT_HEIGHT)}
              aria-label="Viewport height"
            />
            <label className="snapshot-test__toggle">
              <input
                type="checkbox"
                checked={fullPage}
                onChange={(event) => setFullPage(event.target.checked)}
              />
              Full page
            </label>
            <button
              type="button"
              className="snapshot-test__button"
              onClick={() => {
                setError(null);
                setRefreshKey((prev) => prev + 1);
              }}
            >
              Refresh
            </button>
            <a
              className="snapshot-test__link"
              href={snapshotUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open image
            </a>
          </div>
          <p className="snapshot-test__hint">
            This uses the API snapshot endpoint powered by Playwright. If the image
            fails, confirm the API is running and Playwright browsers are installed.
          </p>
        </div>
        <div className="snapshot-test__frame">
          {error ? <div className="snapshot-test__error">{error}</div> : null}
          <img
            src={snapshotUrl}
            alt={`Vocabulary snapshot for ${resolvedWord}`}
            onLoad={() => setError(null)}
            onError={() => setError("Snapshot failed to load.")}
          />
        </div>
      </section>
      <style jsx>{`
        .snapshot-test {
          max-width: 1100px;
          margin: 24px auto 0;
          padding: 0 20px 80px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .snapshot-test__controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .snapshot-test__label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(31, 28, 22, 0.6);
        }
        .snapshot-test__row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .snapshot-test__input {
          flex: 1 1 220px;
          min-width: 180px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(31, 28, 22, 0.2);
          font-size: 14px;
          background: white;
        }
        .snapshot-test__input--small {
          flex: 0 0 110px;
          min-width: 110px;
        }
        .snapshot-test__select {
          flex: 0 0 200px;
          min-width: 180px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(31, 28, 22, 0.2);
          font-size: 14px;
          background: white;
          color: inherit;
        }
        .snapshot-test__toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: rgba(31, 28, 22, 0.7);
        }
        .snapshot-test__button {
          border: none;
          background: var(--reader-accent);
          color: white;
          padding: 10px 16px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 13px;
        }
        .snapshot-test__link {
          border: 1px solid rgba(31, 28, 22, 0.2);
          background: transparent;
          color: var(--reader-ink);
          padding: 10px 16px;
          border-radius: 999px;
          font-size: 13px;
          text-decoration: none;
        }
        .snapshot-test__hint {
          font-size: 13px;
          color: rgba(31, 28, 22, 0.6);
          margin: 0;
        }
        .snapshot-test__frame {
          border: 1px solid rgba(31, 28, 22, 0.15);
          border-radius: 18px;
          overflow: hidden;
          background: #fff;
          min-height: 65vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .snapshot-test__frame img {
          width: 100%;
          height: auto;
          display: block;
        }
        .snapshot-test__error {
          position: absolute;
          top: 16px;
          left: 16px;
          background: rgba(31, 28, 22, 0.85);
          color: white;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          z-index: 2;
        }
      `}</style>
    </main>
  );
}
