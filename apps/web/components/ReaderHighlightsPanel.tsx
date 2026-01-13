"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";
import { formatRelativeTime } from "@/lib/time";

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
  refreshSignal?: { key: number; type: "upsert" | "delete" | "full"; selectionId?: number | null } | null;
  isActive: boolean;
  onJumpToSelection?: (selection: Selection) => void;
};

type TabKey = "selections" | "additions" | "markers";

const MAX_SNIPPET_LENGTH = 160;
const HIGHLIGHTS_CACHE = new Map<
  number,
  { bundles: SelectionBundle[]; sectionsById: Map<number, string> }
>();
const HIGHLIGHTS_REFRESH_KEYS = new Map<number, number>();

function formatSnippet(value: string, limit = MAX_SNIPPET_LENGTH) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function IconJump() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h10" />
      <path d="M11 7l5 5-5 5" />
      <path d="M14 4h5v16h-5" />
    </svg>
  );
}

export default function ReaderHighlightsPanel({
  documentId,
  refreshKey: _refreshKey,
  refreshSignal = null,
  isActive,
  onJumpToSelection,
}: ReaderHighlightsPanelProps) {
  const apiBase = getClientApiBase();
  const [activeTab, setActiveTab] = useState<TabKey>("selections");
  const [bundles, setBundles] = useState<SelectionBundle[]>([]);
  const [sectionsById, setSectionsById] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const bundlesRef = useRef<SelectionBundle[]>([]);
  const sectionsByIdRef = useRef<Map<number, string>>(new Map());
  const lastRefreshKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const cached = HIGHLIGHTS_CACHE.get(documentId);
    if (cached) {
      setBundles(cached.bundles);
      setSectionsById(cached.sectionsById);
      setHasLoaded(true);
    }
    const cachedRefreshKey = HIGHLIGHTS_REFRESH_KEYS.get(documentId) ?? null;
    lastRefreshKeyRef.current = cachedRefreshKey;
  }, [documentId]);

  useEffect(() => {
    bundlesRef.current = bundles;
  }, [bundles]);

  useEffect(() => {
    sectionsByIdRef.current = sectionsById;
  }, [sectionsById]);

  const loadAll = useCallback(
    async (showLoadingState: boolean) => {
      if (showLoadingState) {
        setLoading(true);
      }
      try {
        const documentRes = await fetch(`${apiBase}/books/${documentId}`, {
          cache: "no-store",
        });
        if (!documentRes.ok) {
          return;
        }
        const documentData = (await documentRes.json()) as { sections?: DocumentSection[] };
        const sectionMap = new Map<number, string>();
        (documentData.sections ?? []).forEach((section) => {
          sectionMap.set(section.id, section.section_key);
        });

        const selectionsRes = await fetch(
          `${apiBase}/selections?document_id=${documentId}`,
          { cache: "no-store" }
        );
        if (!selectionsRes.ok) {
          return;
        }
        const selectionsData = (await selectionsRes.json()) as { selections?: Selection[] };
        const selections = selectionsData.selections ?? [];
        const nextBundles = await Promise.all(
          selections.map(async (selection) => {
            const [additionsRes, markersRes] = await Promise.all([
              fetch(`${apiBase}/additions?selection_id=${selection.id}`, { cache: "no-store" }),
              fetch(`${apiBase}/markers?target_type=selection&target_id=${selection.id}`, {
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
                  `${apiBase}/markers?target_type=addition&target_id=${addition.id}`,
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

        setSectionsById(sectionMap);
        const sortedBundles = [...nextBundles].sort((a, b) => {
          return new Date(b.selection.created_at).getTime() - new Date(a.selection.created_at).getTime();
        });
        setBundles(sortedBundles);
        setHasLoaded(true);
        HIGHLIGHTS_CACHE.set(documentId, {
          bundles: sortedBundles,
          sectionsById: sectionMap,
        });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      };
    },
    [apiBase, documentId]
  );

  const refreshSelectionBundle = useCallback(
    async (selectionId: number) => {
      let selection =
        bundlesRef.current.find((bundle) => bundle.selection.id === selectionId)?.selection;
      let sectionMap = sectionsByIdRef.current;
      if (!selection) {
        const selectionsRes = await fetch(
          `${apiBase}/selections?document_id=${documentId}`,
          { cache: "no-store" }
        );
        if (!selectionsRes.ok) {
          return;
        }
        const selectionsData = (await selectionsRes.json()) as { selections?: Selection[] };
        selection = (selectionsData.selections ?? []).find((item) => item.id === selectionId);
        if (!selection) {
          return;
        }
      }
      if (!sectionMap.size) {
        const documentRes = await fetch(`${apiBase}/books/${documentId}`, {
          cache: "no-store",
        });
        if (documentRes.ok) {
          const documentData = (await documentRes.json()) as { sections?: DocumentSection[] };
          sectionMap = new Map<number, string>();
          (documentData.sections ?? []).forEach((section) => {
            sectionMap.set(section.id, section.section_key);
          });
          setSectionsById(sectionMap);
        }
      }

      const [additionsRes, markersRes] = await Promise.all([
        fetch(`${apiBase}/additions?selection_id=${selectionId}`, { cache: "no-store" }),
        fetch(`${apiBase}/markers?target_type=selection&target_id=${selectionId}`, {
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
            `${apiBase}/markers?target_type=addition&target_id=${addition.id}`,
            { cache: "no-store" }
          );
          if (!response.ok) {
            return [addition.id, []] as const;
          }
          const data = (await response.json()) as { markers?: Marker[] };
          return [addition.id, data.markers ?? []] as const;
        })
      );

      const nextBundle: SelectionBundle = {
        selection,
        additions,
        markers: markersData.markers ?? [],
        additionMarkers: Object.fromEntries(additionMarkersEntries),
      };

      setBundles((prev) => {
        const existingIndex = prev.findIndex((bundle) => bundle.selection.id === selectionId);
        const next = existingIndex >= 0
          ? prev.map((bundle, index) => (index === existingIndex ? nextBundle : bundle))
          : [nextBundle, ...prev];
        const sorted = [...next].sort((a, b) => {
          return new Date(b.selection.created_at).getTime() - new Date(a.selection.created_at).getTime();
        });
        HIGHLIGHTS_CACHE.set(documentId, { bundles: sorted, sectionsById: sectionMap });
        return sorted;
      });
      setHasLoaded(true);
    },
    [apiBase, documentId]
  );

  useEffect(() => {
    if (!isActive || hasLoaded || HIGHLIGHTS_CACHE.has(documentId)) {
      return;
    }
    void loadAll(true);
  }, [documentId, hasLoaded, isActive, loadAll]);

  useEffect(() => {
    if (!isActive || !refreshSignal) {
      return;
    }
    if (lastRefreshKeyRef.current === refreshSignal.key) {
      return;
    }
    lastRefreshKeyRef.current = refreshSignal.key;
    HIGHLIGHTS_REFRESH_KEYS.set(documentId, refreshSignal.key);
    if (refreshSignal.type === "delete" && refreshSignal.selectionId) {
      setBundles((prev) => {
        const next = prev.filter((bundle) => bundle.selection.id !== refreshSignal.selectionId);
        HIGHLIGHTS_CACHE.set(documentId, { bundles: next, sectionsById });
        return next;
      });
      return;
    }
    if (refreshSignal.type === "full") {
      void loadAll(false);
      return;
    }
    if (refreshSignal.type === "upsert" && refreshSignal.selectionId) {
      setLoading(true);
      void refreshSelectionBundle(refreshSignal.selectionId).finally(() => {
        setLoading(false);
      });
    }
  }, [documentId, isActive, loadAll, refreshSelectionBundle, refreshSignal, sectionsById]);

  const additions = useMemo(() => {
    const items = bundles.flatMap((bundle) =>
      bundle.additions.map((addition) => ({ ...addition, selectionId: bundle.selection.id }))
    );
    return items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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
    return items.sort(
      (a, b) => new Date(b.marker.created_at).getTime() - new Date(a.marker.created_at).getTime()
    );
  }, [bundles]);

  const tabCounts = {
    selections: bundles.length,
    additions: additions.length,
    markers: markerItems.length,
  };

  if (!isActive) {
    return null;
  }

  const showLoading = loading && bundles.length === 0;
  const showRefreshing = loading && bundles.length > 0;

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

      {showLoading ? <div className="empty-state">Loading...</div> : null}
      {showRefreshing ? (
        <div className="empty-state">
          <span className="explore-spinner" aria-hidden="true" /> Refreshing...
        </div>
      ) : null}

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
                      <div className="data-card__meta-left">
                        <span>Section {sectionKey}</span>
                        {onJumpToSelection ? (
                          <button
                            type="button"
                            className="data-card__jump"
                            onClick={() => onJumpToSelection(selection)}
                            aria-label="Jump to selection"
                            title="Jump to selection"
                          >
                            <IconJump />
                          </button>
                        ) : null}
                      </div>
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
                const sourcePayload = (addition.payload ?? {}) as { source?: { kind?: string } };
                const sourceLabel = sourcePayload.source?.kind
                  ? `Artifact (${sourcePayload.source.kind})`
                  : null;
                const audioPayload = addition.payload as { audio?: { url?: string } } | undefined;
                const audioUrl = audioPayload?.audio?.url
                  ? `${apiBase}${audioPayload.audio.url}`
                  : null;
                const additionLabel =
                  addition.type === "audio"
                    ? "Audio recording"
                    : formatSnippet(addition.text_content ?? addition.title ?? addition.type);
                return (
                  <article key={addition.id} className="data-card">
                    <div className="data-card__meta">
                      <span>{addition.type}</span>
                      <span>{formatRelativeTime(addition.created_at)}</span>
                    </div>
                    <div className="data-card__title">{additionLabel}</div>
                    {audioUrl ? (
                      <audio className="data-card__audio" controls src={audioUrl} />
                    ) : null}
                    <div className="data-card__hint">
                      From: {sourceLabel ?? selectionSnippet}
                    </div>
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
                const additionLabel = addition
                  ? formatSnippet(addition.text_content ?? addition.title ?? addition.type)
                  : "";
                const payload = (addition?.payload ?? {}) as { source?: { kind?: string } };
                const artifactLabel = payload.source?.kind
                  ? `${payload.source.kind}`
                  : addition?.type ?? "addition";
                const targetLabel = addition
                  ? `Artifact (${artifactLabel}): ${additionLabel}`
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
    </div>
  );
}
