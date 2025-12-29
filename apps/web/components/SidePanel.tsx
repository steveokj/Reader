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

type SidePanelProps = {
  selection: Selection | null;
};

export default function SidePanel({ selection }: SidePanelProps) {
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
        </div>
      ) : (
        <div className="side-panel__empty">Click a highlight to inspect it.</div>
      )}
    </aside>
  );
}
