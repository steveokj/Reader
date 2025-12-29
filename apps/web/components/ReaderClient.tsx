"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import ActionMenu from "@/components/ActionMenu";
import ReaderDocument from "@/components/ReaderDocument";
import SelectionOverlay from "@/components/SelectionOverlay";
import SidePanel from "@/components/SidePanel";
import AudioRecorderModal from "@/components/modals/AudioRecorderModal";
import GrammarModal from "@/components/modals/GrammarModal";
import NoteModal from "@/components/modals/NoteModal";
import { buildQuoteSelector } from "@/lib/selection/buildQuoteSelector";
import { getSelectionOffsets } from "@/lib/selection/getSelectionOffsets";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ReaderClientProps = {
  documentId: number;
  sectionId: number;
  contentText: string;
};

type MenuState = {
  top: number;
  left: number;
  selectionText: string;
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

export default function ReaderClient({ documentId, sectionId, contentText }: ReaderClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Range | null>(null);
  const audioSelectionRef = useRef<number | null>(null);

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
        const response = await fetch(
          `${API_BASE}/selections?document_id=${documentId}&section_id=${sectionId}`,
          { cache: "no-store" }
        );
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
  }, [documentId, sectionId]);

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
    async (selector: MenuState["selector"]): Promise<Selection | null> => {
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
    [documentId, sectionId]
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

  const ensureSelectionForAddition = useCallback(async () => {
    if (activeSelectionId) {
      return activeSelectionId;
    }
    const selector = draftSelection?.selector ?? menuState?.selector;
    if (!selector) {
      return null;
    }
    const selection = await persistSelection(selector);
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

      const selectedText = range.toString();
      if (!selectedText.trim()) {
        clearSelection();
        return;
      }

      const offsets = getSelectionOffsets(range, container);
      if (!offsets) {
        clearSelection();
        return;
      }

      const quote = buildQuoteSelector(contentText, offsets.start, offsets.end);
      const existing = selections.find(
        (selection) =>
          selection.selector.position.start === offsets.start &&
          selection.selector.position.end === offsets.end
      );

      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();

      setMenuState({
        top: Math.max(12, rect.top - 48),
        left: Math.max(12, rect.left),
        selectionText: selectedText,
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
    [clearSelection, contentText, selections]
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
  }, []);

  const handleCommitSelection = useCallback(async () => {
    if (!menuState || isCommitted) {
      return;
    }
    const signature = `${menuState.selector.position.start}-${menuState.selector.position.end}`;
    const existing = selections.find(
      (selection) =>
        `${selection.selector.position.start}-${selection.selector.position.end}` === signature
    );
    if (existing) {
      setActiveSelectionId(existing.id);
      setIsCommitted(true);
      setMenuState(null);
      return;
    }
    const selection = await persistSelection(menuState.selector);
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
    setDraftSelection({ selector: menuState.selector, selectionText: menuState.selectionText });
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
    setDraftSelection({ selector: menuState.selector, selectionText: menuState.selectionText });
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
    setDraftSelection({ selector: menuState.selector, selectionText: menuState.selectionText });
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

  const selectionMarkerKinds = markers.map((marker) => marker.kind as MarkerKind);
  const modalMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const modalToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;
  const actionMenuMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const actionMenuToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;

  return (
    <div className="reader-layout">
      <div className="reader-content">
        <div
          className="reader-shell"
          ref={containerRef}
          onMouseUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          <ReaderDocument contentText={contentText} />
          <SelectionOverlay
            selections={selections}
            containerRef={containerRef}
            activeSelectionId={activeSelectionId}
            onSelect={handleSelectHighlight}
          />
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
        </div>
      </div>
      <SidePanel
        selection={activeSelection}
        additions={additions}
        markers={markers}
        additionMarkers={additionMarkers}
        mediaBase={API_BASE}
        documentId={documentId}
        highlightsRefreshKey={selections.length + additions.length + markers.length}
        onEditNote={handleEditNote}
        onToggleMarker={handleToggleMarker}
        onToggleAdditionMarker={handleToggleAdditionMarker}
        onDeleteSelection={handleDeleteSelection}
      />
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
