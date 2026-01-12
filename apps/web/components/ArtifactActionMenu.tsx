"use client";

import MarkerToggle from "@/components/MarkerToggle";

type ArtifactActionMenuProps = {
  top: number;
  left: number;
  variant?: "floating" | "mobile";
  label: string;
  contextText?: string;
  markerKinds: Array<"like" | "highlight" | "todo">;
  onToggleMarker: (kind: "like" | "highlight" | "todo") => void;
  onNote: () => void;
  onAudio: () => void;
  onExplore: () => void;
  onClose: () => void;
};

const MAX_CONTEXT_PREVIEW = 160;

function truncateContext(value: string, limit = MAX_CONTEXT_PREVIEW) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h16M6 16l9-9 3 3-9 9H6v-3z" />
    </svg>
  );
}

function IconAudio() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v10" />
      <path d="M8 7v6" />
      <path d="M16 7v6" />
      <path d="M5 11a7 7 0 0014 0" />
    </svg>
  );
}

function IconExplore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 8-8-4 4-4z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export default function ArtifactActionMenu({
  top,
  left,
  label,
  contextText,
  markerKinds,
  onToggleMarker,
  onNote,
  onAudio,
  onExplore,
  onClose,
  variant = "floating",
}: ArtifactActionMenuProps) {
  const previewText = contextText ? truncateContext(contextText) : "";
  const fullContext = contextText ? contextText.replace(/\s+/g, " ").trim() : "";
  const menuClassName = variant === "mobile" ? "action-menu action-menu--mobile" : "action-menu";
  const menuStyle = variant === "mobile" ? undefined : { top, left };
  const stopEvent = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <div className={menuClassName} style={menuStyle} onMouseUp={stopEvent} onTouchEnd={stopEvent}>
      <div className="action-menu__meta">
        <div className="action-menu__meta-left">
          <span>{label}</span>
        </div>
        <button
          className="action-menu__icon"
          onClick={onClose}
          type="button"
          aria-label="Close"
          title="Close"
        >
          <IconClose />
        </button>
      </div>
      <div className="action-menu__markers">
        <MarkerToggle activeKinds={markerKinds} onToggle={onToggleMarker} compact />
      </div>
      {previewText ? (
        <div className="action-menu__text" title={fullContext}>
          {previewText}
        </div>
      ) : null}
      <div className="action-menu__actions">
        <button type="button" onClick={onNote} aria-label="Note" title="Note">
          <IconNote />
        </button>
        <button type="button" onClick={onAudio} aria-label="Audio" title="Audio">
          <IconAudio />
        </button>
        <button type="button" onClick={onExplore} aria-label="Explore" title="Explore">
          <IconExplore />
        </button>
        <button type="button" aria-label="More" title="More" disabled>
          <IconMore />
        </button>
      </div>
    </div>
  );
}
