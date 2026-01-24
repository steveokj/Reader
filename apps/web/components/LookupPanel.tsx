"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";

import ArtifactActionMenu from "@/components/ArtifactActionMenu";
import { getClientApiBase } from "@/lib/apiBase";

type LookupProvider = "merriam" | "vocabulary";

type LookupPanelProps = {
  open: boolean;
  word: string;
  provider?: LookupProvider;
  refreshKey: number;
  isMobile?: boolean;
  sourceAdditionId?: number | null;
  sourceSelectionId?: number | null;
  onOpenArtifactNote?: (source: {
    additionId: number;
    selectionId: number;
    kind: string;
    previewText?: string;
    snapshotUrl?: string;
  }) => void;
  onOpenArtifactAudio?: (source: {
    additionId: number;
    selectionId: number;
    kind: string;
    previewText?: string;
    snapshotUrl?: string;
  }) => void;
  onOpenArtifactExplore?: (source: {
    additionId: number;
    selectionId: number;
    kind: string;
    previewText?: string;
    snapshotUrl?: string;
  }) => void;
  onArtifactMarkerChanged?: (selectionId: number) => void;
  onRefresh: () => void;
  onClose: () => void;
};

type AdditionMarker = {
  id: number;
  kind: "like" | "highlight" | "todo" | "laugh" | "pending";
};

type ArtifactMenuState = {
  top: number;
  left: number;
  label: string;
  contextText: string;
  additionId: number;
  selectionId: number;
  snapshotUrl: string;
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

function IconExternal() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5M10 14l9-9M19 14v5h-9" />
      <path d="M5 10v9h9" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

export default function LookupPanel({
  open,
  word,
  provider = "vocabulary",
  refreshKey,
  isMobile,
  sourceAdditionId,
  sourceSelectionId,
  onOpenArtifactNote,
  onOpenArtifactAudio,
  onOpenArtifactExplore,
  onArtifactMarkerChanged,
  onRefresh,
  onClose,
}: LookupPanelProps) {
  const apiBase = getClientApiBase();
  const trimmed = word.trim();
  const [activeProvider, setActiveProvider] = useState<LookupProvider>(provider);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [artifactMenu, setArtifactMenu] = useState<ArtifactMenuState | null>(null);
  const [artifactMarkers, setArtifactMarkers] = useState<AdditionMarker[]>([]);

  useEffect(() => {
    if (open) {
      setStatus("loading");
    }
  }, [open, trimmed, refreshKey, activeProvider]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveProvider(provider);
  }, [open, provider]);

  useEffect(() => {
    if (!open) {
      setArtifactMenu(null);
      setArtifactMarkers([]);
    }
  }, [open]);

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
      provider: activeProvider,
      width: String(DEFAULT_VIEWPORT.width),
      height: String(DEFAULT_VIEWPORT.height),
      full_page: DEFAULT_FULL_PAGE ? "true" : "false",
      refresh: refreshKey > 0 ? "1" : "0",
      v: String(refreshKey),
    });
    return `${apiBase}/lookup/snapshot?${params.toString()}`;
  }, [apiBase, activeProvider, refreshKey, trimmed]);

  const artifactMarkerKinds = useMemo(
    () => artifactMarkers.map((marker) => marker.kind),
    [artifactMarkers]
  );

  const loadArtifactMarkers = useCallback(
    async (additionId: number) => {
      try {
        const response = await fetch(
          `${apiBase}/markers?target_type=addition&target_id=${additionId}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { markers?: AdditionMarker[] };
        setArtifactMarkers(data.markers ?? []);
      } catch (error) {
        console.error(error);
      }
    },
    [apiBase]
  );

  const toggleArtifactMarker = useCallback(
    async (kind: "like" | "highlight" | "todo" | "laugh" | "pending") => {
      if (!artifactMenu) {
        return;
      }
      const existing = artifactMarkers.find((marker) => marker.kind === kind);
      if (existing) {
        try {
          const response = await fetch(`${apiBase}/markers/${existing.id}`, {
            method: "DELETE",
          });
          if (response.ok) {
            setArtifactMarkers((prev) => prev.filter((marker) => marker.id !== existing.id));
            onArtifactMarkerChanged?.(artifactMenu.selectionId);
          }
        } catch (error) {
          console.error(error);
        }
        return;
      }
      try {
        const response = await fetch(`${apiBase}/markers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: "addition",
            target_id: artifactMenu.additionId,
            kind,
          }),
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { marker?: AdditionMarker };
        if (data.marker) {
          setArtifactMarkers((prev) => [...prev, data.marker as AdditionMarker]);
          onArtifactMarkerChanged?.(artifactMenu.selectionId);
        }
      } catch (error) {
        console.error(error);
      }
    },
    [apiBase, artifactMarkers, artifactMenu, onArtifactMarkerChanged]
  );

  const handleArtifactAction = useCallback(
    (action: "note" | "audio" | "explore") => {
      if (!artifactMenu) {
        return;
      }
      const source = {
        additionId: artifactMenu.additionId,
        selectionId: artifactMenu.selectionId,
        kind: "grammar-snapshot",
        previewText: artifactMenu.contextText,
        snapshotUrl: artifactMenu.snapshotUrl,
      };
      if (action === "note") {
        onOpenArtifactNote?.(source);
      } else if (action === "audio") {
        onOpenArtifactAudio?.(source);
      } else {
        onOpenArtifactExplore?.(source);
      }
      setArtifactMenu(null);
    },
    [artifactMenu, onOpenArtifactAudio, onOpenArtifactExplore, onOpenArtifactNote]
  );

  const handleSnapshotDoubleClick = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      if (!sourceAdditionId || !sourceSelectionId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const menuWidth = 320;
      const padding = 16;
      const aboveTop = rect.top - 56;
      const menuTop = aboveTop > padding ? aboveTop : rect.bottom + 12;
      const menuLeft = Math.min(
        Math.max(padding, rect.left),
        window.innerWidth - menuWidth - padding
      );
      setArtifactMenu({
        top: menuTop,
        left: menuLeft,
        label: "Dictionary snapshot",
        contextText: `Dictionary snapshot for ${trimmed}`,
        additionId: sourceAdditionId,
        selectionId: sourceSelectionId,
        snapshotUrl,
      });
      void loadArtifactMarkers(sourceAdditionId);
    },
    [loadArtifactMarkers, snapshotUrl, sourceAdditionId, sourceSelectionId, trimmed]
  );

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
            <div className="lookup-panel__provider" role="group" aria-label="Provider">
              <button
                type="button"
                className={activeProvider === "vocabulary" ? "is-active" : ""}
                onClick={() => setActiveProvider("vocabulary")}
              >
                Vocabulary
              </button>
              <button
                type="button"
                className={activeProvider === "merriam" ? "is-active" : ""}
                onClick={() => setActiveProvider("merriam")}
              >
                Merriam
              </button>
            </div>
            <div className="lookup-panel__icon-row">
              <a
                className="lookup-panel__icon-button"
                href={getProviderUrl(activeProvider, trimmed)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open on ${getProviderLabel(activeProvider)}`}
                title={`Open on ${getProviderLabel(activeProvider)}`}
              >
                <IconExternal />
              </a>
              <button
                type="button"
                className="lookup-panel__icon-button"
                onClick={onRefresh}
                aria-label="Refresh snapshot"
                title="Refresh"
              >
                <IconRefresh />
              </button>
              <button
                type="button"
                className="lookup-panel__icon-button"
                onClick={onClose}
                aria-label="Close lookup"
                title="Close"
              >
                <IconClose />
              </button>
            </div>
          </div>
        </div>
        <div className="lookup-panel__body">
          {status === "loading" ? (
            <div className="lookup-panel__overlay">
              <span className="explore-spinner" aria-hidden="true" />
              <span>Loading snapshot...</span>
            </div>
          ) : null}
          {status === "error" ? (
            <div className="lookup-panel__overlay lookup-panel__overlay--error">
              Snapshot failed. Try refresh.
            </div>
          ) : null}
          <img
            src={snapshotUrl}
            alt={`Dictionary snapshot for ${trimmed}`}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            onDoubleClick={handleSnapshotDoubleClick}
          />
        </div>
        {artifactMenu ? (
          isMobile ? (
            <div className="mobile-panel mobile-panel--selection artifact-panel">
              <ArtifactActionMenu
                top={artifactMenu.top}
                left={artifactMenu.left}
                label={artifactMenu.label}
                contextText={artifactMenu.contextText}
                markerKinds={artifactMarkerKinds}
                variant="mobile"
                onToggleMarker={toggleArtifactMarker}
                onNote={() => handleArtifactAction("note")}
                onAudio={() => handleArtifactAction("audio")}
                onExplore={() => handleArtifactAction("explore")}
                onClose={() => setArtifactMenu(null)}
              />
            </div>
          ) : (
            <ArtifactActionMenu
              top={artifactMenu.top}
              left={artifactMenu.left}
              label={artifactMenu.label}
              contextText={artifactMenu.contextText}
              markerKinds={artifactMarkerKinds}
              variant="floating"
              onToggleMarker={toggleArtifactMarker}
              onNote={() => handleArtifactAction("note")}
              onAudio={() => handleArtifactAction("audio")}
              onExplore={() => handleArtifactAction("explore")}
              onClose={() => setArtifactMenu(null)}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
