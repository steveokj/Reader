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
  mediaBase: string;
  onEditNote: (note: Addition) => void;
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

export default function SidePanel({ selection, additions, mediaBase, onEditNote }: SidePanelProps) {
  const notes = additions.filter((addition) => addition.type === "note");
  const grammarItems = additions.filter((addition) => addition.type === "grammar");
  const audioItems = additions.filter((addition) => addition.type === "audio");

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
                  const audio = item.payload as { audio?: { url?: string; mime?: string } };
                  const src = audio.audio?.url
                    ? resolveMediaUrl(audio.audio.url, mediaBase)
                    : undefined;
                  return (
                    <div key={item.id} className="note-card">
                      <div className="note-card__tag">Audio</div>
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
      )}
    </aside>
  );
}
