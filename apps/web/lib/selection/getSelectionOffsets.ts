export type SelectionOffsets = {
  start: number;
  end: number;
};

type ParagraphElement = HTMLElement & {
  dataset: {
    start?: string;
  };
};

function getParagraphElement(node: Node): ParagraphElement | null {
  if (node instanceof HTMLElement) {
    return node.closest("[data-paragraph]") as ParagraphElement | null;
  }
  if (node.parentElement) {
    return node.parentElement.closest("[data-paragraph]") as ParagraphElement | null;
  }
  return null;
}

function getOffsetWithinParagraph(paragraph: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(paragraph, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function getSelectionOffsets(
  range: Range,
  container: HTMLElement
): SelectionOffsets | null {
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const startParagraph = getParagraphElement(range.startContainer);
  const endParagraph = getParagraphElement(range.endContainer);

  if (startParagraph && endParagraph) {
    const startBase = Number.parseInt(startParagraph.dataset.start ?? "0", 10);
    const endBase = Number.parseInt(endParagraph.dataset.start ?? "0", 10);

    if (!Number.isNaN(startBase) && !Number.isNaN(endBase)) {
      const startOffset = startBase + getOffsetWithinParagraph(
        startParagraph,
        range.startContainer,
        range.startOffset
      );
      const endOffset = endBase + getOffsetWithinParagraph(
        endParagraph,
        range.endContainer,
        range.endOffset
      );

      if (!Number.isNaN(startOffset) && !Number.isNaN(endOffset)) {
        return {
          start: Math.min(startOffset, endOffset),
          end: Math.max(startOffset, endOffset),
        };
      }
    }
  }

  const startRange = document.createRange();
  startRange.setStart(container, 0);
  startRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = startRange.toString().length;

  const endRange = document.createRange();
  endRange.setStart(container, 0);
  endRange.setEnd(range.endContainer, range.endOffset);
  const endOffset = endRange.toString().length;

  if (Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
    return null;
  }

  return {
    start: Math.min(startOffset, endOffset),
    end: Math.max(startOffset, endOffset),
  };
}
