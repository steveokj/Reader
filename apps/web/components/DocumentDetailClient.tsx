"use client";

import { useMemo, useState } from "react";

import { formatRelativeTime } from "@/lib/time";

type Document = {
  id: number;
  title: string;
  source_type: string;
  source_ref?: string | null;
  cover_url?: string | null;
  created_at: string;
};

type DocumentSection = {
  id: number;
  document_id: number;
  section_key: string;
  title?: string | null;
  content_text: string;
  content_html?: string | null;
  created_at: string;
};

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
  kind: string;
  created_at: string;
};

type SelectionBundle = {
  selection: Selection;
  additions: Addition[];
  markers: Marker[];
  additionMarkers: Record<number, Marker[]>;
};

type DocumentDetailClientProps = {
  document: Document;
  sections: DocumentSection[];
  bundles: SelectionBundle[];
};

type TabKey = "selections" | "additions" | "markers";

function formatSnippet(value: string, limit = 80) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Untitled";
  }
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit).trimEnd()}...`;
}

export default function DocumentDetailClient({ document, sections, bundles }: DocumentDetailClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("selections");

  const sectionKeyById = useMemo(() => {
    return new Map(sections.map((section) => [section.id, section.section_key]));
  }, [sections]);

  const selectionById = useMemo(() => {
    return new Map(bundles.map((bundle) => [bundle.selection.id, bundle.selection]));
  }, [bundles]);

  const additions = useMemo(() => {
    return bundles.flatMap((bundle) =>
      bundle.additions.map((addition) => ({ ...addition, selectionId: bundle.selection.id }))
    );
  }, [bundles]);

  const additionById = useMemo(() => {
    return new Map(additions.map((addition) => [addition.id, addition]));
  }, [additions]);

  const markerItems = useMemo(() => {
    const items: Array<{
      marker: Marker;
      selectionId: number;
      additionId?: number;
    }> = [];
    bundles.forEach((bundle) => {
      bundle.markers.forEach((marker) => {
        items.push({ marker, selectionId: bundle.selection.id });
      });
      bundle.additions.forEach((addition) => {
        const additionMarkers = bundle.additionMarkers[addition.id] ?? [];
        additionMarkers.forEach((marker) => {
          items.push({ marker, selectionId: bundle.selection.id, additionId: addition.id });
        });
      });
    });
    return items;
  }, [bundles]);

  const tabCounts = {
    selections: bundles.length,
    additions: additions.length,
    markers: markerItems.length,
  };

  return (
    <section className="document-detail">
      <div className="document-detail__tabs">
        {(["selections", "additions", "markers"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "tab-button is-active" : "tab-button"}
            onClick={() => setActiveTab(tab)}
          >
            <span className="tab-label">{tab}</span>
            <span className="tab-count">{tabCounts[tab]}</span>
          </button>
        ))}
      </div>

      {activeTab === "selections" ? (
        <div className="tab-panel">
          {bundles.length === 0 ? (
            <div className="empty-state">No selections yet.</div>
          ) : (
            <div className="card-stack">
              {bundles.map((bundle) => {
                const selection = bundle.selection;
                const sectionKey = sectionKeyById.get(selection.section_id) ?? "unknown";
                return (
                  <article key={selection.id} className="data-card">
                    <div className="data-card__meta">
                      <span>Section {sectionKey}</span>
                      <span>{formatRelativeTime(selection.created_at)}</span>
                    </div>
                    <div className="data-card__title">
                      {formatSnippet(selection.selector.quote.exact)}
                    </div>
                    <div className="data-card__stats">
                      <span>{bundle.additions.length} additions</span>
                      <span>{bundle.markers.length} markers</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "additions" ? (
        <div className="tab-panel">
          {additions.length === 0 ? (
            <div className="empty-state">No additions yet.</div>
          ) : (
            <div className="card-stack">
              {additions.map((addition) => {
                const selection = selectionById.get(addition.selection_id);
                const selectionSnippet = selection
                  ? formatSnippet(selection.selector.quote.exact)
                  : "Selection";
                return (
                  <article key={addition.id} className="data-card">
                    <div className="data-card__meta">
                      <span>{addition.type}</span>
                      <span>{formatRelativeTime(addition.created_at)}</span>
                    </div>
                    <div className="data-card__title">
                      {formatSnippet(addition.text_content ?? addition.title ?? addition.type)}
                    </div>
                    <div className="data-card__hint">From: {selectionSnippet}</div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "markers" ? (
        <div className="tab-panel">
          {markerItems.length === 0 ? (
            <div className="empty-state">No markers yet.</div>
          ) : (
            <div className="card-stack">
              {markerItems.map((item) => {
                const selection = selectionById.get(item.selectionId);
                const selectionSnippet = selection
                  ? formatSnippet(selection.selector.quote.exact)
                  : "Selection";
                const addition = item.additionId ? additionById.get(item.additionId) : null;
                const targetLabel = addition
                  ? `${addition.type}: ${formatSnippet(
                      addition.text_content ?? addition.title ?? addition.type
                    )}`
                  : `Selection: ${selectionSnippet}`;
                return (
                  <article key={item.marker.id} className="data-card">
                    <div className="data-card__meta">
                      <span className="pill">{item.marker.kind}</span>
                      <span>{formatRelativeTime(item.marker.created_at)}</span>
                    </div>
                    <div className="data-card__title">{targetLabel}</div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
