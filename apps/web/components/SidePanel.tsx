import MarkerToggle from "@/components/MarkerToggle";

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

type Marker = {
  id: number;
  target_type: string;
  target_id: number;
  kind: string;
};

type Link = {
  id: number;
  from_type: string;
  from_id: number;
  to_type: string;
  to_id: number;
  relation_type: string;
  label?: string | null;
  created_at: string;
};

type SidePanelProps = {
  selection: Selection | null;
  additions: Addition[];
  markers: Marker[];
  additionMarkers: Record<number, Marker[]>;
  selectionLinksIn: Link[];
  selectionLinksOut: Link[];
  additionLinks: Record<number, { linksIn: Link[]; linksOut: Link[] }>;
  mediaBase: string;
  onEditNote: (note: Addition) => void;
  onToggleMarker: (kind: "like" | "highlight" | "todo") => void;
  onToggleAdditionMarker: (additionId: number, kind: "like" | "highlight" | "todo") => void;
  onOpenLinkSelection: () => void;
  onOpenLinkAddition: (additionId: number) => void;
  onDeleteLink: (linkId: number) => void;
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

function formatSnippet(value: string, limit = 48) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit).trimEnd()}...`;
}

export default function SidePanel({
  selection,
  additions,
  markers,
  additionMarkers,
  selectionLinksIn,
  selectionLinksOut,
  additionLinks,
  mediaBase,
  onEditNote,
  onToggleMarker,
  onToggleAdditionMarker,
  onOpenLinkSelection,
  onOpenLinkAddition,
  onDeleteLink,
}: SidePanelProps) {
  const notes = additions.filter((addition) => addition.type === "note");
  const grammarItems = additions.filter((addition) => addition.type === "grammar");
  const audioItems = additions.filter((addition) => addition.type === "audio");
  const markerKinds = markers.map((marker) => marker.kind as "like" | "highlight" | "todo");
  const selectionLabel = selection
    ? formatSnippet(selection.selector.quote.exact || "Selection")
    : "Selection";

  const describeAdditionLabel = (addition: Addition) => {
    const text = addition.text_content?.trim() || addition.title?.trim() || addition.type;
    return formatSnippet(text || addition.type);
  };

  const resolveNodeLabel = (nodeType: string, nodeId: number) => {
    if (nodeType === "selection") {
      return selectionLabel || `Selection #${nodeId}`;
    }
    if (nodeType === "addition") {
      const addition = additions.find((item) => item.id === nodeId);
      if (addition) {
        return `${addition.type}: ${describeAdditionLabel(addition)}`;
      }
      return `Addition #${nodeId}`;
    }
    return `${nodeType} #${nodeId}`;
  };

  const renderLinks = (linksIn: Link[], linksOut: Link[]) => {
    const items = [
      ...linksOut.map((link) => ({ link, direction: "out" as const })),
      ...linksIn.map((link) => ({ link, direction: "in" as const })),
    ];

    if (items.length === 0) {
      return <div className="side-panel__empty">No links yet.</div>;
    }

    return (
      <div className="link-stack">
        {items.map(({ link, direction }) => {
          const label =
            direction === "out"
              ? resolveNodeLabel(link.to_type, link.to_id)
              : resolveNodeLabel(link.from_type, link.from_id);
          const arrow = direction === "out" ? "->" : "<-";
          return (
            <div key={link.id} className="link-item">
              <span className="link-item__label">
                <span className="link-item__direction">{arrow}</span> {label}
              </span>
              <button type="button" className="link-item__remove" onClick={() => onDeleteLink(link.id)}>
                Remove
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="side-panel">
      <div className="side-panel__header">Active Selection</div>
      {selection ? (
        <div className="side-panel__body">
          <div className="side-panel__quote">{selection.selector.quote.exact}</div>
          <MarkerToggle activeKinds={markerKinds} onToggle={onToggleMarker} />
          <div className="side-panel__actions">
            <button type="button" onClick={onOpenLinkSelection}>
              Link
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
            Saved {new Date(selection.created_at).toLocaleString()}
          </div>
          <div className="side-panel__section">
            <div className="side-panel__section-title">Links</div>
            {renderLinks(selectionLinksIn, selectionLinksOut)}
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
                  const noteLinks = additionLinks[note.id] ?? { linksIn: [], linksOut: [] };
                  const hasNoteLinks = noteLinks.linksIn.length > 0 || noteLinks.linksOut.length > 0;
                  return (
                    <div key={note.id} className="note-card">
                      <div className="note-card__header">
                        <MarkerToggle
                          activeKinds={noteMarkerKinds}
                          onToggle={(kind) => onToggleAdditionMarker(note.id, kind)}
                          compact
                        />
                        <div className="note-card__actions">
                          <button type="button" onClick={() => onOpenLinkAddition(note.id)}>
                            Link
                          </button>
                          <button type="button" onClick={() => onEditNote(note)}>
                            Edit
                          </button>
                        </div>
                      </div>
                      <div className="note-card__text">{note.text_content}</div>
                      {hasNoteLinks ? renderLinks(noteLinks.linksIn, noteLinks.linksOut) : null}
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
                  const grammarLinks = additionLinks[item.id] ?? { linksIn: [], linksOut: [] };
                  const hasGrammarLinks =
                    grammarLinks.linksIn.length > 0 || grammarLinks.linksOut.length > 0;
                  return (
                    <div key={item.id} className="note-card">
                      <div className="note-card__header">
                        <div className="note-card__tag">{formatted.label}</div>
                        <div className="note-card__actions">
                          <button type="button" onClick={() => onOpenLinkAddition(item.id)}>
                            Link
                          </button>
                        </div>
                      </div>
                      {formatted.text ? (
                        <div className="note-card__text">{formatted.text}</div>
                      ) : null}
                      {hasGrammarLinks ? renderLinks(grammarLinks.linksIn, grammarLinks.linksOut) : null}
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
                  const audioLinks = additionLinks[item.id] ?? { linksIn: [], linksOut: [] };
                  const hasAudioLinks = audioLinks.linksIn.length > 0 || audioLinks.linksOut.length > 0;
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
                        <div className="note-card__actions">
                          <div className="note-card__tag">Audio</div>
                          <button type="button" onClick={() => onOpenLinkAddition(item.id)}>
                            Link
                          </button>
                        </div>
                      </div>
                      {src ? <audio controls src={src} /> : null}
                      {hasAudioLinks ? renderLinks(audioLinks.linksIn, audioLinks.linksOut) : null}
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
