"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import MarkerToggle from "@/components/MarkerToggle";
import { getClientApiBase } from "@/lib/apiBase";
import { formatRelativeTime } from "@/lib/time";

type MarkerKind = "like" | "highlight" | "todo";

type Selection = {
  id: number;
  document_id: number;
  section_id: number;
  selector: {
    position: { start: number; end: number };
    quote: { exact: string; prefix: string; suffix: string };
  };
  created_at: string;
};

type Addition = {
  id: number;
  selection_id: number;
  type: string;
  title?: string | null;
  text_content?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type Marker = {
  id: number;
  target_type: string;
  target_id: number;
  kind: MarkerKind;
  created_at: string;
};

type HighlightDetailModalProps = {
  open: boolean;
  mode: "selection" | "addition";
  selection: Selection;
  sectionLabel?: string | null;
  addition?: Addition | null;
  selectionMarkers: Marker[];
  additionMarkers?: Marker[];
  childNotes?: Addition[];
  childAudios?: Addition[];
  onToggleSelectionMarker?: (kind: MarkerKind) => void;
  onToggleAdditionMarker?: (kind: MarkerKind) => void;
  onClose: () => void;
};

type ExplorePayload = {
  prompt?: string;
  content?: string;
};

type GrammarPayload = {
  kind?: string;
  text?: string;
  lookup_url?: string;
};

type AudioPayload = {
  audio?: { url?: string };
};

const DEFAULT_VIEWPORT = { width: 1200, height: 900 };
const DEFAULT_FULL_PAGE = true;
const NOTE_SNIPPET_LENGTH = 140;

function formatSnippet(value: string, limit = NOTE_SNIPPET_LENGTH) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function resolveNoteText(addition: Addition) {
  const payload = addition.payload as { text?: string } | undefined;
  return addition.text_content ?? payload?.text ?? "";
}

function resolveAudioUrl(addition: Addition, apiBase: string) {
  const payload = addition.payload as AudioPayload | undefined;
  const url = payload?.audio?.url;
  return url ? `${apiBase}${url}` : null;
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

export default function HighlightDetailModal({
  open,
  mode,
  selection,
  sectionLabel,
  addition,
  selectionMarkers,
  additionMarkers = [],
  childNotes = [],
  childAudios = [],
  onToggleSelectionMarker,
  onToggleAdditionMarker,
  onClose,
}: HighlightDetailModalProps) {
  const apiBase = getClientApiBase();
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});
  const [snapshotStatus, setSnapshotStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [mounted, setMounted] = useState(false);

  const isAddition = mode === "addition" && addition;
  const activeMarkers = useMemo(() => {
    const markers = isAddition ? additionMarkers : selectionMarkers;
    return Array.from(new Set(markers.map((marker) => marker.kind)));
  }, [additionMarkers, isAddition, selectionMarkers]);

  const noteItems = useMemo(() => {
    return childNotes.map((note) => ({
      id: note.id,
      text: resolveNoteText(note),
    }));
  }, [childNotes]);

  const audioItems = useMemo(() => {
    return childAudios.map((audio) => ({
      id: audio.id,
      url: resolveAudioUrl(audio, apiBase),
    }));
  }, [apiBase, childAudios]);

  const grammarWord = useMemo(() => {
    if (!isAddition || !addition || addition.type !== "grammar") {
      return "";
    }
    const payload = addition.payload as GrammarPayload | undefined;
    if (payload?.kind === "word") {
      return (payload.text ?? "").trim();
    }
    return "";
  }, [addition, isAddition]);

  const grammarSnapshotUrl = useMemo(() => {
    if (!grammarWord) {
      return "";
    }
    const params = new URLSearchParams({
      word: grammarWord,
      provider: "vocabulary",
      width: String(DEFAULT_VIEWPORT.width),
      height: String(DEFAULT_VIEWPORT.height),
      full_page: DEFAULT_FULL_PAGE ? "true" : "false",
    });
    return `${apiBase}/lookup/snapshot?${params.toString()}`;
  }, [apiBase, grammarWord]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setExpandedNotes({});
  }, [open, addition?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (grammarSnapshotUrl) {
      setSnapshotStatus("loading");
    }
  }, [grammarSnapshotUrl, open]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) {
    return null;
  }

  const selectionSnippet = selection.selector.quote.exact.trim();
  const selectionMeta = sectionLabel ? `Section ${sectionLabel}` : "Selection";
  const selectionTimestamp = formatRelativeTime(selection.created_at);
  const additionTimestamp =
    isAddition && addition ? formatRelativeTime(addition.created_at) : null;

  const additionType = addition?.type ?? null;
  const additionLabel = additionType
    ? additionType === "audio"
      ? "Audio"
      : additionType.charAt(0).toUpperCase() + additionType.slice(1)
    : null;

  const showBanner = noteItems.length > 0 || audioItems.length > 0;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--fullscreen" role="dialog" aria-modal="true">
      <div
        className="highlight-detail-modal highlight-detail-modal--fullscreen"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="highlight-detail-modal__top">
          <div className="highlight-detail-modal__header">
            <div>
              <div className="highlight-detail-modal__title">
                {isAddition ? `${additionLabel ?? "Addition"} detail` : "Selection detail"}
              </div>
              <div className="highlight-detail-modal__subtitle">
                {isAddition ? selectionSnippet : selectionSnippet}
              </div>
              <div className="highlight-detail-modal__meta">
                {selectionMeta} - {selectionTimestamp}
                {additionTimestamp ? ` - ${additionTimestamp}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="highlight-detail-modal__close"
              onClick={onClose}
              aria-label="Close detail"
            >
              <IconClose />
            </button>
        </div>

        <div className="highlight-detail-modal__body">
            <div className="highlight-detail-modal__markers">
              <MarkerToggle
                activeKinds={activeMarkers}
                onToggle={(kind) => {
                  if (isAddition) {
                    onToggleAdditionMarker?.(kind);
                  } else {
                    onToggleSelectionMarker?.(kind);
                  }
                }}
                compact
              />
            </div>

            {showBanner ? (
              <div className="highlight-detail-modal__banner">
                {noteItems.map((note) => {
                  const fullText = note.text;
                  const isExpanded = expandedNotes[note.id];
                  const preview = formatSnippet(fullText);
                  const showToggle = fullText && preview !== fullText;
                  return (
                    <div key={note.id} className="highlight-detail-modal__banner-note">
                      <div className="highlight-detail-modal__banner-title">Note</div>
                      <div className="highlight-detail-modal__note-text">
                        {isExpanded ? fullText : preview}
                      </div>
                      {showToggle ? (
                        <button
                          type="button"
                          className="highlight-detail-modal__banner-button"
                          onClick={() =>
                            setExpandedNotes((prev) => ({
                              ...prev,
                              [note.id]: !prev[note.id],
                            }))
                          }
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {audioItems.map((audio) => (
                  <div key={audio.id} className="highlight-detail-modal__banner-audio">
                    <div className="highlight-detail-modal__banner-title">Audio</div>
                    {audio.url ? (
                      <audio controls src={audio.url} />
                    ) : (
                      <div className="highlight-detail-modal__muted">Audio unavailable.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {!isAddition ? (
              <div className="highlight-detail-modal__selection">
                {selectionSnippet || "Selection unavailable."}
              </div>
            ) : null}

            {isAddition && additionType === "note" ? (
              <div className="highlight-detail-modal__note-body">
                {resolveNoteText(addition) || "Note is empty."}
              </div>
            ) : null}

            {isAddition && additionType === "audio" ? (
              <div className="highlight-detail-modal__audio-body">
                {(() => {
                  const url = resolveAudioUrl(addition, apiBase);
                  return url ? (
                    <audio controls src={url} />
                  ) : (
                    <div className="highlight-detail-modal__muted">Audio unavailable.</div>
                  );
                })()}
              </div>
            ) : null}

            {isAddition && additionType === "explore" ? (
              <div className="highlight-detail-modal__chat chat-messages">
                {(() => {
                  const payload = addition.payload as ExplorePayload | undefined;
                  const prompt = payload?.prompt ?? "";
                  const response = payload?.content ?? addition.text_content ?? "";
                  const messages = [
                    { role: "user", content: prompt || "Prompt unavailable." },
                    { role: "assistant", content: response || "Response unavailable." },
                  ];
                  return messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`chat-message chat-message--${message.role}`}
                    >
                      <span className="chat-message__text">{message.content}</span>
                    </div>
                  ));
                })()}
              </div>
            ) : null}

            {isAddition && additionType === "grammar" ? (
              <div className="highlight-detail-modal__snapshot">
                {grammarSnapshotUrl ? (
                  <>
                    {snapshotStatus === "loading" ? (
                      <div className="highlight-detail-modal__snapshot-overlay">
                        <span className="explore-spinner" aria-hidden="true" />
                        Loading snapshot...
                      </div>
                    ) : null}
                    {snapshotStatus === "error" ? (
                      <div className="highlight-detail-modal__snapshot-overlay highlight-detail-modal__snapshot-overlay--error">
                        Snapshot failed.
                      </div>
                    ) : null}
                    <img
                      src={grammarSnapshotUrl}
                      alt={`Dictionary snapshot for ${grammarWord || "word"}`}
                      onLoad={() => setSnapshotStatus("ready")}
                      onError={() => setSnapshotStatus("error")}
                    />
                  </>
                ) : (
                  <div className="highlight-detail-modal__muted">
                    {addition.text_content
                      ? addition.text_content
                      : "No snapshot available for this grammar item."}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
