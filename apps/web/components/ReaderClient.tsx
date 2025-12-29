"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import ActionMenu from "@/components/ActionMenu";
import ReaderDocument from "@/components/ReaderDocument";
import SelectionOverlay from "@/components/SelectionOverlay";
import SidePanel from "@/components/SidePanel";
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

  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelectionId, setActiveSelectionId] = useState<number | null>(null);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Addition | null>(null);

  const activeSelection = selections.find((selection) => selection.id === activeSelectionId) ?? null;

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
      return;
    }

    const loadAdditions = async () => {
      try {
        const response = await fetch(`${API_BASE}/additions?selection_id=${activeSelectionId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { additions?: Addition[] };
        setAdditions(data.additions ?? []);
      } catch (error) {
        console.error(error);
      }
    };

    loadAdditions();
  }, [activeSelectionId]);

  const clearSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    setMenuState(null);
    setIsCommitted(false);
    anchorRef.current = null;
  }, []);

  const persistSelection = useCallback(
    async (selector: MenuState["selector"]) => {
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
          }
        }
      } finally {
        setIsSaving(false);
      }
    },
    [documentId, sectionId]
  );

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
      return;
    }
    await persistSelection(menuState.selector);
  }, [isCommitted, menuState, persistSelection, selections]);

  const handleOpenNote = useCallback(() => {
    if (!activeSelectionId) {
      return;
    }
    setEditingNote(null);
    setNoteModalOpen(true);
  }, [activeSelectionId]);

  const handleSaveNote = useCallback(
    async (text: string) => {
      if (!activeSelectionId) {
        return;
      }
      if (!text.trim()) {
        setNoteModalOpen(false);
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
          }
        }
      } else {
        const response = await fetch(`${API_BASE}/additions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selection_id: activeSelectionId,
            type: "note",
            text_content: text,
            payload: { text },
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { addition?: Addition };
          if (data.addition) {
            setAdditions((prev) => [...prev, data.addition as Addition]);
          }
        }
      }

      setNoteModalOpen(false);
      setEditingNote(null);
    },
    [activeSelectionId, editingNote]
  );

  const handleEditNote = useCallback((note: Addition) => {
    setEditingNote(note);
    setNoteModalOpen(true);
  }, []);

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
          {menuState ? (
            <ActionMenu
              top={menuState.top}
              left={menuState.left}
              selectionText={menuState.selectionText}
              isSaving={isSaving}
              isCommitted={isCommitted}
              canCreateNote={Boolean(activeSelectionId)}
              onCommit={handleCommitSelection}
              onNote={handleOpenNote}
              onClose={clearSelection}
            />
          ) : null}
        </div>
      </div>
      <SidePanel selection={activeSelection} additions={additions} onEditNote={handleEditNote} />
      <NoteModal
        isOpen={noteModalOpen}
        initialText={editingNote?.text_content ?? ""}
        title={editingNote ? "Edit note" : "New note"}
        onSave={handleSaveNote}
        onClose={() => {
          setNoteModalOpen(false);
          setEditingNote(null);
        }}
      />
    </div>
  );
}
