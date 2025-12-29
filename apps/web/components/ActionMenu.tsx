type ActionMenuProps = {
  top: number;
  left: number;
  selectionText: string;
  isSaving: boolean;
  canCreateNote: boolean;
  onNote: () => void;
  onClose: () => void;
};

export default function ActionMenu({
  top,
  left,
  selectionText,
  isSaving,
  canCreateNote,
  onNote,
  onClose,
}: ActionMenuProps) {
  return (
    <div className="action-menu" style={{ top, left }}>
      <div className="action-menu__meta">
        <span>{isSaving ? "Saving selection..." : "Selection saved"}</span>
        <button className="action-menu__close" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <div className="action-menu__text">{selectionText}</div>
      <div className="action-menu__actions">
        <button type="button" onClick={onNote} disabled={!canCreateNote}>
          Note
        </button>
        <button type="button">Audio</button>
        <button type="button">Grammar</button>
        <button type="button">Explore</button>
        <button type="button">More</button>
      </div>
    </div>
  );
}
