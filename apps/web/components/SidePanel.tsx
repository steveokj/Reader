"use client";

import { useState } from "react";

import MarkerToggle from "@/components/MarkerToggle";
import ReaderHighlightsPanel from "@/components/ReaderHighlightsPanel";

type Selection = {
  id: number;
  document_id: number;
  section_id: number;
  selector: {
    position: {
      start: number;
      end: number;
    };
    quote: {
      exact: string;
      prefix: string;
      suffix: string;
    };
  };
  created_at: string;
};

type Addition = {
  id: number;
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
  kind: string;
};

type SidePanelProps = {
  selection: Selection | null;
  additions: Addition[];
  markers: Marker[];
  additionMarkers: Record<number, Marker[]>;
  mediaBase: string;
  documentId: number;
  highlightsRefreshKey: number;
  initialTab?: "active" | "highlights";
  activeTab?: "active" | "highlights";
  onTabChange?: (tab: "active" | "highlights") => void;
  onEditNote: (note: Addition) => void;
  onToggleMarker: (kind: "like" | "highlight" | "todo") => void;
  onToggleAdditionMarker: (additionId: number, kind: "like" | "highlight" | "todo") => void;
  onDeleteSelection: () => void;
  onJumpToSelection: (selection: Selection) => void;
};

function formatGrammar(addition: Addition) {
  const payload = addition.payload as { kind?: string; text?: string };
  const label = payload.kind ? payload.kind : "grammar";
  const text = addition.text_content || payload.text || "";
  return { label, text };
}

function resolveMediaUrl(url: string, mediaBase: string) {
  if (url.startsWith("http") || url.startsWith("blob:")) {
    return url;
  }
  return `${mediaBase}${url}`;
}

export default function SidePanel({
  selection,
  additions,
  markers,
  additionMarkers,
  mediaBase,
  documentId,
  highlightsRefreshKey,
  initialTab = "active",
  activeTab,
  onTabChange,
  onEditNote,
  onToggleMarker,
  onToggleAdditionMarker,
  onDeleteSelection,
  onJumpToSelection,
}: SidePanelProps) {
  const [internalTab, setInternalTab] = useState<"active" | "highlights">(initialTab);
  const resolvedTab = activeTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const notes = additions.filter((addition) => addition.type === "note");
  const grammarItems = additions.filter((addition) => addition.type === "grammar");
  const audioItems = additions.filter((addition) => addition.type === "audio");
  const markerKinds = markers.map((marker) => marker.kind as "like" | "highlight" | "todo");

  return (
    <aside className="side-panel">
      <div className="side-panel__header">Selection Panel</div>
      <div className="side-panel__tabs">
        <button
          type="button"
          className={resolvedTab === "active" ? "side-panel__tab is-active" : "side-panel__tab"}
          onClick={() => setTab("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={
            resolvedTab === "highlights" ? "side-panel__tab is-active" : "side-panel__tab"
          }
          onClick={() => setTab("highlights")}
        >
          Highlights
        </button>
      </div>
      {resolvedTab === "active" ? (
        selection ? (
          <div className="side-panel__body">
            <div className="side-panel__quote">{selection.selector.quote.exact}</div>
            <MarkerToggle activeKinds={markerKinds} onToggle={onToggleMarker} />
            <div className="side-panel__actions">
              <button
                type="button"
                onClick={onDeleteSelection}
                className="side-panel__danger"
                aria-label="Delete selection"
                title="Delete selection"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16" />
                  <path d="M9 7l1-2h4l1 2" />
                  <path d="M8 7l1 12h6l1-12" />
                </svg>
              </button>
            </div>
            <div className="side-panel__meta">
              <div>
                <span>Start</span>
                <strong>{selection.selector.position.start}</strong>
              </div>
              <div>
                <span>End</span>
                <strong>{selection.selector.position.end}</strong>
              </div>
            </div>
            <div className="side-panel__timestamp">
              Saved {new Date(selection.created_at).toISOString()}
            </div>
            <div className="side-panel__section">
              <div className="side-panel__section-title">Notes</div>
              {notes.length === 0 ? (
                <div className="side-panel__empty">No notes yet.</div>
              ) : (
                <div className="note-list">
                  {notes.map((note) => {
                    const noteMarkers = additionMarkers[note.id] ?? [];
                    const noteMarkerKinds = noteMarkers.map(
                      (marker) => marker.kind as "like" | "highlight" | "todo"
                    );
                    return (
                      <div key={note.id} className="note-card">
                        <div className="note-card__header">
                          <MarkerToggle
                            activeKinds={noteMarkerKinds}
                            onToggle={(kind) => onToggleAdditionMarker(note.id, kind)}
                            compact
                          />
                          <button type="button" onClick={() => onEditNote(note)}>
                            Edit
                          </button>
                        </div>
                        <div className="note-card__text">{note.text_content}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="side-panel__section">
              <div className="side-panel__section-title">Grammar</div>
              {grammarItems.length === 0 ? (
                <div className="side-panel__empty">No grammar items yet.</div>
              ) : (
                <div className="note-list">
                  {grammarItems.map((item) => {
                    const formatted = formatGrammar(item);
                    return (
                      <div key={item.id} className="note-card">
                        <div className="note-card__tag">{formatted.label}</div>
                        {formatted.text ? (
                          <div className="note-card__text">{formatted.text}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="side-panel__section">
              <div className="side-panel__section-title">Audio</div>
              {audioItems.length === 0 ? (
                <div className="side-panel__empty">No audio yet.</div>
              ) : (
                <div className="note-list">
                  {audioItems.map((item) => {
                    const audioMarkers = additionMarkers[item.id] ?? [];
                    const audioMarkerKinds = audioMarkers.map(
                      (marker) => marker.kind as "like" | "highlight" | "todo"
                    );
                    const audio = item.payload as { audio?: { url?: string; mime?: string } };
                    const src = audio.audio?.url
                      ? resolveMediaUrl(audio.audio.url, mediaBase)
                      : undefined;
                    return (
                      <div key={item.id} className="note-card">
                        <div className="note-card__header">
                          <MarkerToggle
                            activeKinds={audioMarkerKinds}
                            onToggle={(kind) => onToggleAdditionMarker(item.id, kind)}
                            compact
                          />
                          <div className="note-card__tag">Audio</div>
                        </div>
                        {src ? <audio controls src={src} /> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="side-panel__empty">Click a highlight to inspect it.</div>
        )
      ) : (
        <ReaderHighlightsPanel
          documentId={documentId}
          refreshKey={highlightsRefreshKey}
          isActive={resolvedTab === "highlights"}
          onJumpToSelection={onJumpToSelection}
        />
      )}
    </aside>
  );
}
