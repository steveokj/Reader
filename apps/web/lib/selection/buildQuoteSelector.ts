const DEFAULT_CONTEXT_SIZE = 48;

type QuoteSelector = {
  exact: string;
  prefix: string;
  suffix: string;
};

export function buildQuoteSelector(
  contentText: string,
  start: number,
  end: number,
  contextSize = DEFAULT_CONTEXT_SIZE
): QuoteSelector {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(contentText.length, end);
  const exact = contentText.slice(safeStart, safeEnd);

  const prefixStart = Math.max(0, safeStart - contextSize);
  const suffixEnd = Math.min(contentText.length, safeEnd + contextSize);

  return {
    exact,
    prefix: contentText.slice(prefixStart, safeStart),
    suffix: contentText.slice(safeEnd, suffixEnd),
  };
}
