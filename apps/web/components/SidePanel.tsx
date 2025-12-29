type Selection = {
  id: number;
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

type SidePanelProps = {
  selection: Selection | null;
  additions: Addition[];
  onEditNote: (note: Addition) => void;
};

export default function SidePanel({ selection, additions, onEditNote }: SidePanelProps) {
  const notes = additions.filter((addition) => addition.type === "note");

  return (
    <aside className="side-panel">
      <div className="side-panel__header">Active Selection</div>
      {selection ? (
        <div className="side-panel__body">
          <div className="side-panel__quote">{selection.selector.quote.exact}</div>
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
            Saved {new Date(selection.created_at).toLocaleString()}
          </div>
          <div className="side-panel__section">
            <div className="side-panel__section-title">Notes</div>
            {notes.length === 0 ? (
              <div className="side-panel__empty">No notes yet.</div>
            ) : (
              <div className="note-list">
                {notes.map((note) => (
                  <div key={note.id} className="note-card">
                    <div className="note-card__text">{note.text_content}</div>
                    <button type="button" onClick={() => onEditNote(note)}>
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="side-panel__empty">Click a highlight to inspect it.</div>
      )}
    </aside>
  );
}
