type NodeOffset = {
  node: Node;
  offset: number;
};

type ParagraphElement = HTMLElement & {
  dataset: {
    start?: string;
  };
};

function resolveParagraphRange(
  container: HTMLElement,
  start: number,
  end: number
): Range | null {
  const paragraphs = Array.from(container.querySelectorAll<ParagraphElement>("[data-paragraph]"));
  if (!paragraphs.length) {
    return null;
  }

  const findParagraph = (offset: number) => {
    for (const paragraph of paragraphs) {
      const startAttr = paragraph.dataset.start;
      if (!startAttr) {
        continue;
      }
      const base = Number.parseInt(startAttr, 10);
      if (Number.isNaN(base)) {
        continue;
      }
      const textLength = paragraph.textContent?.length ?? 0;
      const endOffset = base + textLength;
      if (offset >= base && offset <= endOffset) {
        return { paragraph, localOffset: Math.min(offset - base, textLength) };
      }
    }
    return null;
  };

  const resolveNode = (paragraph: HTMLElement, offset: number) => {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let node = walker.nextNode();
    let lastNode: Node | null = null;

    while (node) {
      const textLength = node.textContent?.length ?? 0;
      if (offset <= currentOffset + textLength) {
        return { node, offset: offset - currentOffset };
      }
      currentOffset += textLength;
      lastNode = node;
      node = walker.nextNode();
    }

    if (lastNode) {
      return { node: lastNode, offset: lastNode.textContent?.length ?? 0 };
    }

    return null;
  };

  const startInfo = findParagraph(start);
  const endInfo = findParagraph(end);

  if (!startInfo || !endInfo) {
    return null;
  }

  const startNodeInfo = resolveNode(startInfo.paragraph, startInfo.localOffset);
  const endNodeInfo = resolveNode(endInfo.paragraph, endInfo.localOffset);

  if (!startNodeInfo || !endNodeInfo) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startNodeInfo.node, startNodeInfo.offset);
  range.setEnd(endNodeInfo.node, endNodeInfo.offset);
  return range;
}

function resolveNodeOffset(
  walker: TreeWalker,
  targetOffset: number
): NodeOffset | null {
  let currentOffset = 0;
  let node = walker.nextNode();
  let lastNode: Node | null = null;

  while (node) {
    const textLength = node.textContent?.length ?? 0;
    const nextOffset = currentOffset + textLength;
    if (targetOffset <= nextOffset) {
      return { node, offset: targetOffset - currentOffset };
    }
    currentOffset = nextOffset;
    lastNode = node;
    node = walker.nextNode();
  }

  if (lastNode) {
    return { node: lastNode, offset: lastNode.textContent?.length ?? 0 };
  }

  return null;
}

export function rangeFromOffsets(
  container: HTMLElement,
  start: number,
  end: number
): Range | null {
  const paragraphRange = resolveParagraphRange(container, start, end);
  if (paragraphRange) {
    return paragraphRange;
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const startInfo = resolveNodeOffset(walker, start);
  if (!startInfo) {
    return null;
  }

  const endWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const endInfo = resolveNodeOffset(endWalker, end);
  if (!endInfo) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startInfo.node, startInfo.offset);
  range.setEnd(endInfo.node, endInfo.offset);
  return range;
}
