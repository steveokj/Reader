"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

import ActionMenu from "@/components/ActionMenu";
import ReaderDocument from "@/components/ReaderDocument";
import ReaderHighlightsPanel from "@/components/ReaderHighlightsPanel";
import ReaderSectionPicker from "@/components/ReaderSectionPicker";
import SelectionOverlay from "@/components/SelectionOverlay";
import SidePanel from "@/components/SidePanel";
import AudioRecorderModal from "@/components/modals/AudioRecorderModal";
import GrammarModal from "@/components/modals/GrammarModal";
import NoteModal from "@/components/modals/NoteModal";
import { buildQuoteSelector } from "@/lib/selection/buildQuoteSelector";
import { getSelectionOffsets } from "@/lib/selection/getSelectionOffsets";
import { rangeFromOffsets } from "@/lib/selection/rangeFromOffsets";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ReaderSection = {
  id: number;
  section_key: string;
  title?: string | null;
  content_text: string;
  content_html?: string | null;
};

type ReaderClientProps = {
  documentId: number;
  documentTitle: string;
  sourceType: string;
  sections: ReaderSection[];
  initialSectionKey?: string | null;
};

type MenuState = {
  top: number;
  left: number;
  selectionText: string;
  sectionId: number;
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
};

type Selection = {
  id: number;
  document_id: number;
  section_id: number;
  selector: MenuState["selector"];
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
  kind: "like" | "highlight" | "todo";
};

type MarkerKind = "like" | "highlight" | "todo";

type DraftSelection = {
  selector: MenuState["selector"];
  selectionText: string;
  sectionId: number;
};

type GrammarPayload = {
  kind: "word" | "bars" | "structure" | "lookup";
  text?: string;
  lookup_url?: string;
};

type AudioPayload = {
  url: string;
  mime: string;
  size_bytes: number;
};

function IconChapters() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h6v14H5z" />
      <path d="M13 7h6v12h-6z" />
      <path d="M7 9h2" />
      <path d="M15 11h2" />
    </svg>
  );
}

function IconNew() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4" />
    </svg>
  );
}

function IconHighlights() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8" />
      <path d="M8 13h6" />
    </svg>
  );
}

type CaretRangeFromPoint = (x: number, y: number) => Range | null;
type CaretPositionFromPoint = (x: number, y: number) => { offsetNode: Node; offset: number } | null;

function getCaretRangeFromPoint(x: number, y: number): Range | null {
  const caretRangeFromPoint = (document as unknown as { caretRangeFromPoint?: CaretRangeFromPoint })
    .caretRangeFromPoint;
  if (caretRangeFromPoint) {
    return caretRangeFromPoint.call(document, x, y);
  }

  const caretPositionFromPoint = (
    document as unknown as { caretPositionFromPoint?: CaretPositionFromPoint }
  ).caretPositionFromPoint;
  if (caretPositionFromPoint) {
    const position = caretPositionFromPoint.call(document, x, y);
    if (!position) {
      return null;
    }
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

function buildRange(anchor: Range, focus: Range): Range {
  const range = document.createRange();
  const comparison = anchor.compareBoundaryPoints(Range.START_TO_START, focus);
  if (comparison <= 0) {
    range.setStart(anchor.startContainer, anchor.startOffset);
    range.setEnd(focus.startContainer, focus.startOffset);
  } else {
    range.setStart(focus.startContainer, focus.startOffset);
    range.setEnd(anchor.startContainer, anchor.startOffset);
  }
  return range;
}

export default function ReaderClient({
  documentId,
  documentTitle,
  sourceType,
  sections,
  initialSectionKey,
}: ReaderClientProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Range | null>(null);
  const audioSelectionRef = useRef<number | null>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelectionId, setActiveSelectionId] = useState<number | null>(null);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [additionMarkers, setAdditionMarkers] = useState<Record<number, Marker[]>>({});
  const [pendingMarkerKinds, setPendingMarkerKinds] = useState<MarkerKind[]>([]);
  const [draftSelection, setDraftSelection] = useState<DraftSelection | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [grammarModalOpen, setGrammarModalOpen] = useState(false);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Addition | null>(null);
  const scrolledSectionRef = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"chapters" | "highlights" | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<"active" | "highlights">("highlights");

  const sectionById = useMemo(() => {
    return new Map(sections.map((section) => [section.id, section]));
  }, [sections]);

  const activeSelection = selections.find((selection) => selection.id === activeSelectionId) ?? null;
  const grammarSelectionText =
    menuState?.selectionText ??
    draftSelection?.selectionText ??
    activeSelection?.selector.quote.exact ??
    "";

  const refreshAdditionMarkers = useCallback(async (items: Addition[]) => {
    if (items.length === 0) {
      setAdditionMarkers({});
      return;
    }
    try {
      const entries = await Promise.all(
        items.map(async (item) => {
          const response = await fetch(
            `${API_BASE}/markers?target_type=addition&target_id=${item.id}`,
            { cache: "no-store" }
          );
          if (!response.ok) {
            return [item.id, []] as const;
          }
          const data = (await response.json()) as { markers?: Marker[] };
          return [item.id, data.markers ?? []] as const;
        })
      );
      setAdditionMarkers(Object.fromEntries(entries));
    } catch (error) {
      console.error(error);
    }
  }, []);

  const refreshAdditions = useCallback(
    async (selectionId: number) => {
      try {
        const response = await fetch(`${API_BASE}/additions?selection_id=${selectionId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { additions?: Addition[] };
        const nextAdditions = data.additions ?? [];
        setAdditions(nextAdditions);
        await refreshAdditionMarkers(nextAdditions);
      } catch (error) {
        console.error(error);
      }
    },
    [refreshAdditionMarkers]
  );

  const refreshMarkers = useCallback(async (selectionId: number) => {
    try {
      const response = await fetch(
        `${API_BASE}/markers?target_type=selection&target_id=${selectionId}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { markers?: Marker[] };
      setMarkers(data.markers ?? []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const loadSelections = async () => {
      try {
        const response = await fetch(`${API_BASE}/selections?document_id=${documentId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { selections?: Selection[] };
        setSelections(data.selections ?? []);
      } catch (error) {
        console.error(error);
      }
    };

    loadSelections();
  }, [documentId]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };
    setIsMobile(media.matches);
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
    } else {
      media.addListener(handleChange);
    }
    return () => {
      if (media.addEventListener) {
        media.removeEventListener("change", handleChange);
      } else {
        media.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
      setMobilePanel(null);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!initialSectionKey) {
      return;
    }
    if (scrolledSectionRef.current === initialSectionKey) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const safeKey = initialSectionKey.replace(/"/g, '\\"');
    const target = container.querySelector<HTMLElement>(`[data-section-key="${safeKey}"]`);
    if (target) {
      target.scrollIntoView({ block: "start" });
      scrolledSectionRef.current = initialSectionKey;
    }
  }, [initialSectionKey, sections]);

  useEffect(() => {
    if (!activeSelectionId) {
      setAdditions([]);
      setMarkers([]);
      setAdditionMarkers({});
      return;
    }

    refreshAdditions(activeSelectionId);
    refreshMarkers(activeSelectionId);
  }, [activeSelectionId, refreshAdditions, refreshMarkers]);

  const clearSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    setMenuState(null);
    setIsCommitted(false);
    setPendingMarkerKinds([]);
    setDraftSelection(null);
    anchorRef.current = null;
  }, []);

  const discardDraftSelection = useCallback(() => {
    if (!activeSelectionId && !isCommitted) {
      clearSelection();
    } else {
      setDraftSelection(null);
    }
  }, [activeSelectionId, clearSelection, isCommitted]);

  const persistSelection = useCallback(
    async (selector: MenuState["selector"], sectionId: number): Promise<Selection | null> => {
      setIsSaving(true);
      try {
        const response = await fetch(`${API_BASE}/selections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: documentId,
            section_id: sectionId,
            selector,
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { selection?: Selection };
          if (data.selection) {
            setSelections((prev) => {
              if (prev.some((item) => item.id === data.selection?.id)) {
                return prev;
              }
              return [...prev, data.selection as Selection];
            });
            setActiveSelectionId(data.selection.id);
            setIsCommitted(true);
            setMenuState(null);
            return data.selection as Selection;
          }
        }
      } finally {
        setIsSaving(false);
      }
      return null;
    },
    [documentId]
  );

  const persistSelectionMarkers = useCallback(async (selectionId: number, kinds: MarkerKind[]) => {
    const created: Marker[] = [];
    for (const kind of kinds) {
      const response = await fetch(`${API_BASE}/markers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type: "selection",
          target_id: selectionId,
          kind,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { marker?: Marker };
        if (data.marker) {
          created.push(data.marker as Marker);
        }
      }
    }
    if (created.length) {
      setMarkers(created);
    }
  }, []);

  const getSectionElementFromNode = useCallback((node: Node | null): HTMLElement | null => {
    if (!node) {
      return null;
    }
    if (node instanceof HTMLElement) {
      return node.closest("[data-section-id]") as HTMLElement | null;
    }
    if (node.parentElement) {
      return node.parentElement.closest("[data-section-id]") as HTMLElement | null;
    }
    return null;
  }, []);

  const getSectionElementForSelection = useCallback(
    (selection: Selection): HTMLElement | null => {
      const container = containerRef.current;
      if (!container) {
        return null;
      }
      return container.querySelector<HTMLElement>(`[data-section-id="${selection.section_id}"]`);
    },
    []
  );

  const ensureSelectionForAddition = useCallback(async () => {
    if (activeSelectionId) {
      return activeSelectionId;
    }
    const selector = draftSelection?.selector ?? menuState?.selector;
    const selectionSectionId = draftSelection?.sectionId ?? menuState?.sectionId;
    if (!selector || !selectionSectionId) {
      return null;
    }
    const selection = await persistSelection(selector, selectionSectionId);
    if (selection && pendingMarkerKinds.length) {
      await persistSelectionMarkers(selection.id, pendingMarkerKinds);
      setPendingMarkerKinds([]);
    }
    setDraftSelection(null);
    return selection?.id ?? null;
  }, [
    activeSelectionId,
    draftSelection,
    menuState,
    pendingMarkerKinds,
    persistSelection,
    persistSelectionMarkers,
  ]);

  const finalizeRange = useCallback(
    (range: Range) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const sectionElement = getSectionElementFromNode(range.startContainer);
      const endSectionElement = getSectionElementFromNode(range.endContainer);
      if (!sectionElement || !endSectionElement || sectionElement !== endSectionElement) {
        clearSelection();
        return;
      }
      const sectionId = Number(sectionElement.dataset.sectionId ?? "");
      if (!sectionId || Number.isNaN(sectionId)) {
        clearSelection();
        return;
      }

      const selectedText = range.toString();
      if (!selectedText.trim()) {
        clearSelection();
        return;
      }

      const offsets = getSelectionOffsets(range, sectionElement);
      if (!offsets) {
        clearSelection();
        return;
      }

      const section = sectionById.get(sectionId);
      const usesParagraphOffsets = Boolean(sectionElement.querySelector("[data-paragraph]"));
      const currentText = usesParagraphOffsets
        ? section?.content_text ?? ""
        : sectionElement.textContent ?? section?.content_text ?? "";
      const quote = buildQuoteSelector(currentText, offsets.start, offsets.end);
      const existing = selections.find(
        (selection) =>
          selection.section_id === sectionId &&
          selection.selector.position.start === offsets.start &&
          selection.selector.position.end === offsets.end
      );

      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();

      setMenuState({
        top: Math.max(12, rect.top - 48),
        left: Math.max(12, rect.left),
        selectionText: selectedText,
        sectionId,
        selector: {
          position: offsets,
          quote,
        },
      });

      if (existing) {
        setActiveSelectionId(existing.id);
        setIsCommitted(true);
      } else {
        setActiveSelectionId(null);
        setIsCommitted(false);
      }
      setPendingMarkerKinds([]);
    },
    [clearSelection, getSectionElementFromNode, sectionById, selections]
  );

  const handlePointerUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      clearSelection();
      return;
    }

    if (selection.isCollapsed) {
      clearSelection();
      return;
    }

    anchorRef.current = null;
    finalizeRange(selection.getRangeAt(0));
  }, [clearSelection, finalizeRange]);

  const handleDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const pointRange = getCaretRangeFromPoint(event.clientX, event.clientY);
      if (!pointRange) {
        return;
      }
      if (!container.contains(pointRange.startContainer)) {
        return;
      }

      event.preventDefault();

      if (!anchorRef.current) {
        anchorRef.current = pointRange;
        return;
      }

      const combined = buildRange(anchorRef.current, pointRange);
      anchorRef.current = null;

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(combined);
      }

      finalizeRange(combined);
    },
    [finalizeRange]
  );

  const handleSelectHighlight = useCallback((selection: Selection) => {
    setActiveSelectionId(selection.id);
    setIsCommitted(true);
    setSidePanelTab("active");
  }, []);

  const handleCommitSelection = useCallback(async () => {
    if (!menuState || isCommitted) {
      return;
    }
    const signature = `${menuState.selector.position.start}-${menuState.selector.position.end}`;
    const existing = selections.find(
      (selection) =>
        selection.section_id === menuState.sectionId &&
        `${selection.selector.position.start}-${selection.selector.position.end}` === signature
    );
    if (existing) {
      setActiveSelectionId(existing.id);
      setIsCommitted(true);
      setMenuState(null);
      return;
    }
    const selection = await persistSelection(menuState.selector, menuState.sectionId);
    if (selection && pendingMarkerKinds.length) {
      await persistSelectionMarkers(selection.id, pendingMarkerKinds);
      setPendingMarkerKinds([]);
    }
  }, [isCommitted, menuState, persistSelection, selections, pendingMarkerKinds, persistSelectionMarkers]);

  const handleTogglePendingMarker = useCallback((kind: MarkerKind) => {
    setPendingMarkerKinds((prev) =>
      prev.includes(kind) ? prev.filter((item) => item !== kind) : [...prev, kind]
    );
  }, []);

  const handleOpenNote = useCallback(async () => {
    if (isCommitted && activeSelectionId) {
      setEditingNote(null);
      setNoteModalOpen(true);
      return;
    }
    if (!menuState) {
      return;
    }
    setDraftSelection({
      selector: menuState.selector,
      selectionText: menuState.selectionText,
      sectionId: menuState.sectionId,
    });
    setMenuState(null);
    setEditingNote(null);
    setNoteModalOpen(true);
  }, [
    activeSelectionId,
    isCommitted,
    menuState,
    setDraftSelection,
  ]);

  const handleOpenGrammar = useCallback(async () => {
    if (isCommitted && activeSelectionId) {
      setGrammarModalOpen(true);
      return;
    }
    if (!menuState) {
      return;
    }
    setDraftSelection({
      selector: menuState.selector,
      selectionText: menuState.selectionText,
      sectionId: menuState.sectionId,
    });
    setMenuState(null);
    setGrammarModalOpen(true);
  }, [
    activeSelectionId,
    isCommitted,
    menuState,
    setDraftSelection,
  ]);

  const handleOpenAudio = useCallback(async () => {
    if (isCommitted && activeSelectionId) {
      audioSelectionRef.current = activeSelectionId;
      setAudioModalOpen(true);
      return;
    }
    if (!menuState) {
      return;
    }
    setDraftSelection({
      selector: menuState.selector,
      selectionText: menuState.selectionText,
      sectionId: menuState.sectionId,
    });
    setMenuState(null);
    audioSelectionRef.current = null;
    setAudioModalOpen(true);
  }, [
    activeSelectionId,
    isCommitted,
    menuState,
    setDraftSelection,
  ]);

  const handleClearAudioSelection = useCallback(async () => {
    const selectionId = audioSelectionRef.current ?? activeSelectionId;
    if (!selectionId) {
      discardDraftSelection();
      setAudioModalOpen(false);
      setMenuState(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/selections/${selectionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSelections((prev) => prev.filter((item) => item.id !== selectionId));
        if (activeSelectionId === selectionId) {
          setActiveSelectionId(null);
          setAdditions([]);
          setMarkers([]);
          setAdditionMarkers({});
        }
      }
    } catch (error) {
      console.error(error);
    }

    audioSelectionRef.current = null;
    setAudioModalOpen(false);
    clearSelection();
  }, [activeSelectionId, clearSelection, discardDraftSelection]);

  const handleSaveNote = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        discardDraftSelection();
        setNoteModalOpen(false);
        return;
      }
      const selectionId = await ensureSelectionForAddition();
      if (!selectionId) {
        setNoteModalOpen(false);
        setEditingNote(null);
        return;
      }

      if (editingNote) {
        const response = await fetch(`${API_BASE}/additions/${editingNote.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text_content: text,
            payload: { text },
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { addition?: Addition };
          if (data.addition) {
            setAdditions((prev) =>
              prev.map((item) => (item.id === data.addition?.id ? data.addition : item))
            );
            setMenuState(null);
          }
        }
      } else {
        const response = await fetch(`${API_BASE}/additions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selection_id: selectionId,
            type: "note",
            text_content: text,
            payload: { text },
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { addition?: Addition };
          if (data.addition) {
            setAdditions((prev) => [...prev, data.addition as Addition]);
            setMenuState(null);
          }
        }
      }

      setNoteModalOpen(false);
      setEditingNote(null);
    },
    [activeSelectionId, editingNote, ensureSelectionForAddition, discardDraftSelection]
  );

  const handleSaveGrammar = useCallback(
    async (payload: GrammarPayload) => {
      const selectionId = await ensureSelectionForAddition();
      if (!selectionId) {
        setGrammarModalOpen(false);
        return;
      }

      const textContent =
        payload.kind === "word" || payload.kind === "bars" ? payload.text ?? null : null;

      const response = await fetch(`${API_BASE}/additions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection_id: selectionId,
          type: "grammar",
          text_content: textContent,
          payload,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { addition?: Addition };
        if (data.addition) {
          setAdditions((prev) => [...prev, data.addition as Addition]);
          setMenuState(null);
          if (payload.kind === "lookup" && payload.lookup_url) {
            window.open(payload.lookup_url, "_blank", "noopener,noreferrer");
          }
        }
      }

      setGrammarModalOpen(false);
    },
    [ensureSelectionForAddition]
  );

  const handleSaveAudio = useCallback(
    async (payload: AudioPayload) => {
      const selectionId = await ensureSelectionForAddition();
      if (!selectionId) {
        setAudioModalOpen(false);
        return;
      }

      const response = await fetch(`${API_BASE}/additions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection_id: selectionId,
          type: "audio",
          payload: { audio: payload },
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { addition?: Addition };
        if (data.addition) {
          setAdditions((prev) => {
            if (prev.some((item) => item.id === data.addition?.id)) {
              return prev;
            }
            return [...prev, data.addition as Addition];
          });
          await refreshAdditions(selectionId);
          setMenuState(null);
        }
      }

      setAudioModalOpen(false);
    },
    [ensureSelectionForAddition, refreshAdditions]
  );

  const handleEditNote = useCallback((note: Addition) => {
    setEditingNote(note);
    setNoteModalOpen(true);
  }, []);

  const handleToggleMarker = useCallback(
    async (kind: MarkerKind) => {
      if (!activeSelectionId) {
        return;
      }
      const existing = markers.find((marker) => marker.kind === kind);
      if (existing) {
        const response = await fetch(`${API_BASE}/markers/${existing.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setMarkers((prev) => prev.filter((item) => item.id !== existing.id));
        }
        return;
      }
      const response = await fetch(`${API_BASE}/markers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type: "selection",
          target_id: activeSelectionId,
          kind,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { marker?: Marker };
        if (data.marker) {
          setMarkers((prev) => [...prev, data.marker as Marker]);
        }
      }
    },
    [activeSelectionId, markers]
  );

  const handleToggleAdditionMarker = useCallback(
    async (additionId: number, kind: MarkerKind) => {
      const existing = (additionMarkers[additionId] ?? []).find((marker) => marker.kind === kind);
      if (existing) {
        const response = await fetch(`${API_BASE}/markers/${existing.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setAdditionMarkers((prev) => ({
            ...prev,
            [additionId]: prev[additionId].filter((item) => item.id !== existing.id),
          }));
        }
        return;
      }
      const response = await fetch(`${API_BASE}/markers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type: "addition",
          target_id: additionId,
          kind,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { marker?: Marker };
        if (data.marker) {
          setAdditionMarkers((prev) => ({
            ...prev,
            [additionId]: [...(prev[additionId] ?? []), data.marker as Marker],
          }));
        }
      }
    },
    [additionMarkers]
  );

  const handleDeleteSelection = useCallback(async () => {
    if (!activeSelectionId) {
      return;
    }
    const selectionId = activeSelectionId;
    try {
      const response = await fetch(`${API_BASE}/selections/${selectionId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        return;
      }
      setSelections((prev) => prev.filter((item) => item.id !== selectionId));
      setActiveSelectionId(null);
      setAdditions([]);
      setMarkers([]);
      setAdditionMarkers({});
      setMenuState(null);
      setIsCommitted(false);
      setPendingMarkerKinds([]);
      setDraftSelection(null);
      setNoteModalOpen(false);
      setGrammarModalOpen(false);
      setAudioModalOpen(false);
      setEditingNote(null);
      audioSelectionRef.current = null;
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    } catch (error) {
      console.error(error);
    }
  }, [activeSelectionId]);

  const handleBodyClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isMobile) {
        return;
      }
      if (event.detail >= 3) {
        setMobileNavOpen(true);
        return;
      }
      if (!mobileNavOpen) {
        return;
      }
      const target = event.target as Node;
      if (mobileNavRef.current?.contains(target) || mobilePanelRef.current?.contains(target)) {
        return;
      }
      setMobileNavOpen(false);
      setMobilePanel(null);
    },
    [isMobile, mobileNavOpen]
  );

  const handleJumpToSelection = useCallback(
    (selection: Selection) => {
      setActiveSelectionId(selection.id);
      setIsCommitted(true);
      setMenuState(null);
      setPendingMarkerKinds([]);
      setDraftSelection(null);
      setNoteModalOpen(false);
      setGrammarModalOpen(false);
      setAudioModalOpen(false);
      setEditingNote(null);
      audioSelectionRef.current = null;
      setSidePanelTab("active");
      if (isMobile) {
        setMobilePanel(null);
        setMobileNavOpen(false);
      }

      const sectionElement = getSectionElementForSelection(selection);
      if (!sectionElement) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const range = rangeFromOffsets(
        sectionElement,
        selection.selector.position.start,
        selection.selector.position.end
      );
      const rect = range ? range.getBoundingClientRect() : sectionElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = rect.top - containerRect.top + container.scrollTop;
      const scrollTarget = Math.max(0, offsetTop - 120);
      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (isScrollable) {
        container.scrollTo({ top: scrollTarget });
      } else {
        window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - 120) });
      }
    },
    [getSectionElementForSelection, isMobile]
  );

  const selectionMarkerKinds = markers.map((marker) => marker.kind as MarkerKind);
  const modalMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const modalToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;
  const actionMenuMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const actionMenuToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;

  return (
    <div className="reader-layout reader-layout--columns">
      <aside className="reader-sidebar">
        <div className="reader-sidebar__header">
          <div className="reader-kicker">{sourceType}</div>
          <h1 className="reader-title">{documentTitle}</h1>
        </div>
        <ReaderSectionPicker
          documentId={documentId}
          sections={sections}
          activeKey={initialSectionKey ?? null}
        />
        <div className="reader-sidebar__links">
          <button
            type="button"
            className="reader-sidebar__link"
            onClick={() => router.push("/new")}
          >
            Add new book
          </button>
          <button
            type="button"
            className="reader-sidebar__link"
            onClick={() => router.push("/settings")}
          >
            Settings
          </button>
        </div>
      </aside>
      <div className="reader-body" onClick={handleBodyClick}>
        <div className="reader-shell">
          <div
            className="reader-scroll"
            ref={containerRef}
            onMouseUp={handlePointerUp}
            onTouchEnd={handlePointerUp}
            onDoubleClick={handleDoubleClick}
          >
            {sections.map((section) => (
              <section
                key={section.id}
                className="reader-section"
                data-section-id={section.id}
                data-section-key={section.section_key}
              >
                {!section.content_html && section.title ? (
                  <h2 className="reader-section__title">{section.title}</h2>
                ) : null}
                <ReaderDocument
                  contentText={section.content_text}
                  contentHtml={section.content_html}
                  mediaBase={API_BASE}
                />
              </section>
            ))}
            <SelectionOverlay
              selections={selections}
              containerRef={containerRef}
              activeSelectionId={activeSelectionId}
              onSelect={handleSelectHighlight}
              getSectionElement={getSectionElementForSelection}
            />
          </div>
          {menuState && !noteModalOpen && !grammarModalOpen && !audioModalOpen ? (
            <ActionMenu
              top={menuState.top}
              left={menuState.left}
              selectionText={menuState.selectionText}
              isSaving={isSaving}
              isCommitted={isCommitted}
              markerKinds={actionMenuMarkerKinds}
              showMarkers
              onToggleMarker={actionMenuToggle}
              onCommit={handleCommitSelection}
              onNote={handleOpenNote}
              onAudio={handleOpenAudio}
              onGrammar={handleOpenGrammar}
              onClose={clearSelection}
            />
          ) : null}
          {isMobile && mobilePanel ? (
            <div
              className="mobile-panel"
              ref={mobilePanelRef}
              onClick={(event) => event.stopPropagation()}
            >
              {mobilePanel === "chapters" ? (
                <div className="mobile-panel__content">
                  <div className="mobile-panel__title">Chapters</div>
                  <ReaderSectionPicker
                    documentId={documentId}
                    sections={sections}
                    activeKey={initialSectionKey ?? null}
                  />
                </div>
              ) : (
                <ReaderHighlightsPanel
                  documentId={documentId}
                  refreshKey={selections.length + additions.length + markers.length}
                  isActive
                  onJumpToSelection={handleJumpToSelection}
                />
              )}
            </div>
          ) : null}
          {isMobile && mobileNavOpen ? (
            <div
              className="mobile-nav"
              ref={mobileNavRef}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setMobilePanel((prev) => (prev === "chapters" ? null : "chapters"))
                }
                aria-label="Chapters"
                className={mobilePanel === "chapters" ? "is-active" : undefined}
              >
                <IconChapters />
                <span>Chapters</span>
              </button>
              <button type="button" onClick={() => router.push("/new")} aria-label="New">
                <IconNew />
                <span>New</span>
              </button>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                aria-label="Settings"
              >
                <IconSettings />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setMobilePanel((prev) => (prev === "highlights" ? null : "highlights"))
                }
                aria-label="Highlights"
                className={mobilePanel === "highlights" ? "is-active" : undefined}
              >
                <IconHighlights />
                <span>Highlights</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {!isMobile ? (
        <aside className="reader-highlights">
          <SidePanel
            selection={activeSelection}
            additions={additions}
            markers={markers}
            additionMarkers={additionMarkers}
            mediaBase={API_BASE}
            documentId={documentId}
            highlightsRefreshKey={selections.length + additions.length + markers.length}
            initialTab="highlights"
            activeTab={sidePanelTab}
            onTabChange={setSidePanelTab}
            onEditNote={handleEditNote}
            onToggleMarker={handleToggleMarker}
            onToggleAdditionMarker={handleToggleAdditionMarker}
            onDeleteSelection={handleDeleteSelection}
            onJumpToSelection={handleJumpToSelection}
          />
        </aside>
      ) : null}
      <NoteModal
        isOpen={noteModalOpen}
        initialText={editingNote?.text_content ?? ""}
        title={editingNote ? "Edit note" : "New note"}
        markerKinds={modalMarkerKinds}
        onToggleMarker={modalToggle}
        onSave={handleSaveNote}
        onClose={() => {
          if (!editingNote && !isCommitted) {
            discardDraftSelection();
          }
          setNoteModalOpen(false);
          setEditingNote(null);
        }}
      />
      <GrammarModal
        isOpen={grammarModalOpen}
        selectionText={grammarSelectionText}
        markerKinds={modalMarkerKinds}
        onToggleMarker={modalToggle}
        onSave={handleSaveGrammar}
        onClose={() => {
          if (!isCommitted) {
            discardDraftSelection();
          }
          setGrammarModalOpen(false);
        }}
      />
      <AudioRecorderModal
        isOpen={audioModalOpen}
        apiBase={API_BASE}
        markerKinds={modalMarkerKinds}
        onToggleMarker={modalToggle}
        onSave={handleSaveAudio}
        onClearSelection={handleClearAudioSelection}
        onClose={() => {
          if (!isCommitted) {
            discardDraftSelection();
          }
          setAudioModalOpen(false);
        }}
      />
    </div>
  );
}
