type ActionMenuProps = {
  top: number;
  left: number;
  selectionText: string;
  isSaving: boolean;
  isCommitted: boolean;
  onCommit: () => void;
  onNote: () => void;
  onAudio: () => void;
  onGrammar: () => void;
  onClose: () => void;
};

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l4 4 10-10" />
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

function IconGrammar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 10h10M4 14h16M4 18h8" />
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

export default function ActionMenu({
  top,
  left,
  selectionText,
  isSaving,
  isCommitted,
  onCommit,
  onNote,
  onAudio,
  onGrammar,
  onClose,
}: ActionMenuProps) {
  const status = isSaving ? "Saving..." : isCommitted ? "Saved" : "Not saved";

  return (
    <div className="action-menu" style={{ top, left }}>
      <div className="action-menu__meta">
        <div className="action-menu__meta-left">
          <button
            className="action-menu__commit"
            type="button"
            onClick={onCommit}
            disabled={isSaving || isCommitted}
            aria-label="Save selection"
            title="Save selection"
          >
            <IconCheck />
          </button>
          <span>{status}</span>
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
      <div className="action-menu__text">{selectionText}</div>
      <div className="action-menu__actions">
        <button type="button" onClick={onNote} aria-label="Note" title="Note">
          <IconNote />
        </button>
        <button type="button" onClick={onAudio} aria-label="Audio" title="Audio">
          <IconAudio />
        </button>
        <button type="button" onClick={onGrammar} aria-label="Grammar" title="Grammar">
          <IconGrammar />
        </button>
        <button type="button" aria-label="Explore" title="Explore">
          <IconExplore />
        </button>
        <button type="button" aria-label="More" title="More">
          <IconMore />
        </button>
      </div>
    </div>
  );
}
