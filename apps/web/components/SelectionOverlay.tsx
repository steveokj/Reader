"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

import { rangeFromOffsets } from "@/lib/selection/rangeFromOffsets";

type Selection = {
  id: number;
  document_id: number;
  section_id: number;
  isSearchHit?: boolean;
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

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Highlight = {
  selection: Selection;
  rects: HighlightRect[];
};

type SelectionOverlayProps = {
  selections: Selection[];
  containerRef: RefObject<HTMLDivElement>;
  activeSelectionId: number | null;
  onSelect: (selection: Selection) => void;
  getSectionElement?: (selection: Selection) => HTMLElement | null;
  refreshKey?: string | number;
};

export default function SelectionOverlay({
  selections,
  containerRef,
  activeSelectionId,
  onSelect,
  getSectionElement,
  refreshKey,
}: SelectionOverlayProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const computeHighlights = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const nextHighlights: Highlight[] = [];

    selections.forEach((selection) => {
      const sectionElement = getSectionElement ? getSectionElement(selection) : null;
      const scope = sectionElement ?? container;
      const { start, end } = selection.selector.position;
      const range = rangeFromOffsets(scope, start, end);
      if (!range) {
        return;
      }

      const rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          top: rect.top - containerRect.top + container.scrollTop,
          left: rect.left - containerRect.left + container.scrollLeft,
          width: rect.width,
          height: rect.height,
        }));

      if (rects.length) {
        nextHighlights.push({ selection, rects });
      }
    });

    setHighlights(nextHighlights);
  }, [containerRef, selections, getSectionElement]);

  useLayoutEffect(() => {
    computeHighlights();
  }, [computeHighlights, refreshKey]);

  useEffect(() => {
    let frame: number | null = null;
    const handle = () => {
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        computeHighlights();
      });
    };

    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [computeHighlights]);

  return (
    <div className="selection-overlay">
      {highlights.map((highlight) =>
        highlight.rects.map((rect, index) => {
          const isSearchHit = Boolean(highlight.selection.isSearchHit);
          const isDraft = !isSearchHit && highlight.selection.id <= 0;
          const isInteractive = !isDraft && !isSearchHit;
          const className = [
            "selection-highlight",
            highlight.selection.id === activeSelectionId ? "is-active" : "",
            isDraft ? "selection-highlight--draft" : "",
            isSearchHit ? "selection-highlight--search" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const style = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            pointerEvents: isInteractive ? "auto" : "none",
          } as const;

          if (!isInteractive) {
            return <div key={`${highlight.selection.id}-${index}`} className={className} style={style} />;
          }

          return (
            <button
              key={`${highlight.selection.id}-${index}`}
              type="button"
              className={className}
              style={style}
              onClick={() => onSelect(highlight.selection)}
            />
          );
        })
      )}
    </div>
  );
}
