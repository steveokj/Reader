"use client";

import { useCallback, useRef, useState } from "react";
import type { MouseEvent } from "react";

import ActionMenu from "@/components/ActionMenu";
import ReaderDocument from "@/components/ReaderDocument";
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
  const lastSignatureRef = useRef<string | null>(null);

  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const clearSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    setMenuState(null);
    anchorRef.current = null;
  }, []);

  const persistSelection = useCallback(
    async (selector: MenuState["selector"]) => {
      const signature = `${selector.position.start}-${selector.position.end}`;
      if (signature === lastSignatureRef.current) {
        return;
      }
      lastSignatureRef.current = signature;
      setIsSaving(true);
      try {
        await fetch(`${API_BASE}/selections`, {
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

      persistSelection({ position: offsets, quote });
    },
    [clearSelection, contentText, persistSelection]
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

  return (
    <div
      className="reader-shell"
      ref={containerRef}
      onMouseUp={handlePointerUp}
      onTouchEnd={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <ReaderDocument contentText={contentText} />
      {menuState ? (
        <ActionMenu
          top={menuState.top}
          left={menuState.left}
          selectionText={menuState.selectionText}
          isSaving={isSaving}
          onClose={clearSelection}
        />
      ) : null}
    </div>
  );
}
