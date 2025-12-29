"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

type DocumentSection = {
  id: number;
  section_key: string;
};

type SelectionBundle = {
  selection: Selection;
  additions: Addition[];
  markers: Marker[];
  additionMarkers: Record<number, Marker[]>;
};

type ReaderHighlightsPanelProps = {
  documentId: number;
  refreshKey: number;
  isActive: boolean;
};

type TabKey = "selections" | "additions" | "markers";

function formatSnippet(value: string, limit = 60) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Untitled";
  }
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit).trimEnd()}...`;
}

export default function ReaderHighlightsPanel({ documentId, refreshKey, isActive }: ReaderHighlightsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("selections");
  const [bundles, setBundles] = useState<SelectionBundle[]>([]);
  const [sectionsById, setSectionsById] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const documentRes = await fetch(`${API_BASE}/documents/${documentId}`, {
          cache: "no-store",
        });
        if (!documentRes.ok) {
          if (!cancelled) {
            setBundles([]);
          }
          return;
        }
        const documentData = (await documentRes.json()) as { sections?: DocumentSection[] };
        const sectionMap = new Map<number, string>();
        (documentData.sections ?? []).forEach((section) => {
          sectionMap.set(section.id, section.section_key);
        });

        const selectionsRes = await fetch(
          `${API_BASE}/selections?document_id=${documentId}`,
          { cache: "no-store" }
        );
        if (!selectionsRes.ok) {
          if (!cancelled) {
            setBundles([]);
          }
          return;
        }
        const selectionsData = (await selectionsRes.json()) as { selections?: Selection[] };
        const selections = selectionsData.selections ?? [];
        const nextBundles = await Promise.all(
          selections.map(async (selection) => {
            const [additionsRes, markersRes] = await Promise.all([
              fetch(`${API_BASE}/additions?selection_id=${selection.id}`, { cache: "no-store" }),
              fetch(`${API_BASE}/markers?target_type=selection&target_id=${selection.id}`, {
                cache: "no-store",
              }),
            ]);
            const additionsData = additionsRes.ok
              ? ((await additionsRes.json()) as { additions?: Addition[] })
              : { additions: [] };
            const markersData = markersRes.ok
              ? ((await markersRes.json()) as { markers?: Marker[] })
              : { markers: [] };

            const additions = additionsData.additions ?? [];
            const additionMarkersEntries = await Promise.all(
              additions.map(async (addition) => {
                const response = await fetch(
                  `${API_BASE}/markers?target_type=addition&target_id=${addition.id}`,
                  { cache: "no-store" }
                );
                if (!response.ok) {
                  return [addition.id, []] as const;
                }
                const data = (await response.json()) as { markers?: Marker[] };
                return [addition.id, data.markers ?? []] as const;
              })
            );

            return {
              selection,
              additions,
              markers: markersData.markers ?? [],
              additionMarkers: Object.fromEntries(additionMarkersEntries),
            } as SelectionBundle;
          })
        );

        if (!cancelled) {
          setSectionsById(sectionMap);
          setBundles(nextBundles);
        }
      } catch (error) {
        if (!cancelled) {
          setBundles([]);
        }
        console.error(error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [documentId, refreshKey, isActive]);

  const additions = useMemo(() => {
    return bundles.flatMap((bundle) =>
      bundle.additions.map((addition) => ({ ...addition, selectionId: bundle.selection.id }))
    );
  }, [bundles]);

  const selectionById = useMemo(() => {
    return new Map(bundles.map((bundle) => [bundle.selection.id, bundle.selection]));
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

  if (!isActive) {
    return null;
  }

  return (
    <div className="highlights-panel">
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

      {loading ? <div className="empty-state">Loading...</div> : null}

      {activeTab === "selections" ? (
        <div className="tab-panel">
          {bundles.length === 0 ? (
            <div className="empty-state">No selections yet.</div>
          ) : (
            <div className="card-stack">
              {bundles.map((bundle) => {
                const selection = bundle.selection;
                const sectionKey = sectionsById.get(selection.section_id) ?? `${selection.section_id}`;
                return (
                  <article key={selection.id} className="data-card">
                    <div className="data-card__meta">
                      <span>Section {sectionKey}</span>
                      <span>{new Date(selection.created_at).toISOString()}</span>
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
                      <span>{new Date(addition.created_at).toISOString()}</span>
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
                      <span>{new Date(item.marker.created_at).toISOString()}</span>
                    </div>
                    <div className="data-card__title">{targetLabel}</div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
