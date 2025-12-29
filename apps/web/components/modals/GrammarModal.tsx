"use client";

import MarkerToggle from "@/components/MarkerToggle";

type GrammarPayload = {
  kind: "word" | "bars" | "structure" | "lookup";
  text?: string;
  lookup_url?: string;
};

type GrammarModalProps = {
  isOpen: boolean;
  selectionText: string;
  markerKinds: Array<"like" | "highlight" | "todo">;
  onToggleMarker: (kind: "like" | "highlight" | "todo") => void;
  onSave: (payload: GrammarPayload) => void;
  onClose: () => void;
};

function buildLookupUrl(text: string) {
  const query = encodeURIComponent(text.trim());
  return `https://www.google.com/search?q=define+${query}`;
}

function IconWord() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h6M4 12h10M4 17h14" />
    </svg>
  );
}

function IconBars() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5v14M12 5v14M18 5v14" />
    </svg>
  );
}

function IconStructure() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 12h10M7 17h12" />
    </svg>
  );
}

function IconLookup() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

export default function GrammarModal({
  isOpen,
  selectionText,
  markerKinds,
  onToggleMarker,
  onSave,
  onClose,
}: GrammarModalProps) {
  if (!isOpen) {
    return null;
  }

  const trimmed = selectionText.trim();
  const lookupUrl = buildLookupUrl(trimmed);
  const disabled = !trimmed;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Grammar</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-markers">
          <MarkerToggle activeKinds={markerKinds} onToggle={onToggleMarker} compact />
        </div>
        <div className="modal-icon-grid">
          <button
            type="button"
            className="modal-icon-button"
            onClick={() => onSave({ kind: "word", text: trimmed })}
            disabled={disabled}
            aria-label="Word to learn"
            title="Word"
          >
            <IconWord />
          </button>
          <button
            type="button"
            className="modal-icon-button"
            onClick={() => onSave({ kind: "bars", text: selectionText })}
            disabled={disabled}
            aria-label="Bars"
            title="Bars"
          >
            <IconBars />
          </button>
          <button
            type="button"
            className="modal-icon-button"
            onClick={() => onSave({ kind: "structure", text: selectionText })}
            disabled={disabled}
            aria-label="Structure"
            title="Structure"
          >
            <IconStructure />
          </button>
          <button
            type="button"
            className="modal-icon-button"
            onClick={() => onSave({ kind: "lookup", text: trimmed, lookup_url: lookupUrl })}
            disabled={disabled}
            aria-label="Lookup"
            title="Lookup"
          >
            <IconLookup />
          </button>
        </div>
      </div>
    </div>
  );
}
