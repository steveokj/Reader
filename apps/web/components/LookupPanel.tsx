"use client";

import { useEffect, useMemo, useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";

type LookupProvider = "merriam" | "vocabulary";

type LookupPanelProps = {
  open: boolean;
  word: string;
  provider?: LookupProvider;
  refreshKey: number;
  isMobile?: boolean;
  onRefresh: () => void;
  onClose: () => void;
};

const DEFAULT_VIEWPORT = { width: 1200, height: 900 };
const DEFAULT_FULL_PAGE = true;

function getProviderLabel(provider: LookupProvider) {
  return provider === "merriam" ? "Merriam-Webster" : "Vocabulary.com";
}

function getProviderUrl(provider: LookupProvider, word: string) {
  const encoded = encodeURIComponent(word.trim());
  if (provider === "merriam") {
    return `https://www.merriam-webster.com/dictionary/${encoded}`;
  }
  return `https://www.vocabulary.com/dictionary/${encoded}`;
}

export default function LookupPanel({
  open,
  word,
  provider = "vocabulary",
  refreshKey,
  isMobile,
  onRefresh,
  onClose,
}: LookupPanelProps) {
  const apiBase = getClientApiBase();
  const trimmed = word.trim();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (open) {
      setStatus("loading");
    }
  }, [open, trimmed, provider, refreshKey]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const root = document.documentElement;
    root.classList.add("lookup-modal-open");
    return () => {
      root.classList.remove("lookup-modal-open");
    };
  }, [open]);

  const snapshotUrl = useMemo(() => {
    const params = new URLSearchParams({
      word: trimmed,
      provider,
      width: String(DEFAULT_VIEWPORT.width),
      height: String(DEFAULT_VIEWPORT.height),
      full_page: DEFAULT_FULL_PAGE ? "true" : "false",
      refresh: refreshKey > 0 ? "1" : "0",
      v: String(refreshKey),
    });
    return `${apiBase}/lookup/snapshot?${params.toString()}`;
  }, [apiBase, provider, refreshKey, trimmed]);

  if (!open || !trimmed) {
    return null;
  }

  const forceMobile = process.env.NEXT_PUBLIC_LOOKUP_FORCE_MOBILE === "1";
  const panelClassName =
    isMobile || forceMobile ? "lookup-panel lookup-panel--mobile" : "lookup-panel";

  return (
    <div className="lookup-modal is-open" aria-hidden={!open} onClick={onClose}>
      <div
        className={panelClassName}
        role="dialog"
        aria-label="Dictionary lookup"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lookup-panel__header">
          <div className="lookup-panel__title">
            <span className="lookup-panel__label">Dictionary</span>
            <span className="lookup-panel__word">{trimmed}</span>
          </div>
          <div className="lookup-panel__actions">
            <a
              className="lookup-panel__link"
              href={getProviderUrl(provider, trimmed)}
              target="_blank"
              rel="noreferrer"
            >
              Open on {getProviderLabel(provider)}
            </a>
            <button type="button" onClick={onRefresh}>
              Refresh
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="lookup-panel__body">
          {status === "loading" ? (
            <div className="lookup-panel__status">Loading snapshot...</div>
          ) : null}
          {status === "error" ? (
            <div className="lookup-panel__status lookup-panel__status--error">
              Snapshot failed. Try refresh.
            </div>
          ) : null}
          <img
            src={snapshotUrl}
            alt={`Dictionary snapshot for ${trimmed}`}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        </div>
      </div>
    </div>
  );
}
