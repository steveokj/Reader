function normalizeTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildTitleVariants(title: string) {
  const variants = new Set<string>();
  const normalized = normalizeTitle(title);
  if (normalized) {
    variants.add(normalized);
  }
  const separators = [":", " - ", " – ", " — ", " —", " –", "—", "–", "("];
  for (const separator of separators) {
    const index = title.indexOf(separator);
    if (index > 0) {
      const part = title.slice(0, index);
      const normalizedPart = normalizeTitle(part);
      if (normalizedPart) {
        variants.add(normalizedPart);
      }
    }
  }
  return variants;
}

function matchesTitle(text: string, titleVariants: Set<string>) {
  const normalizedText = normalizeTitle(text);
  if (!normalizedText) {
    return false;
  }
  for (const variant of titleVariants) {
    if (!variant) {
      continue;
    }
    if (normalizedText === variant) {
      return true;
    }
    if (normalizedText.startsWith(variant)) {
      return true;
    }
    if (variant.startsWith(normalizedText) && normalizedText.length > 6) {
      return true;
    }
  }
  return false;
}

export function stripDocumentTitleFromHtml(html: string, documentTitle?: string | null) {
  if (!documentTitle) {
    return html;
  }
  const titleVariants = buildTitleVariants(documentTitle);
  if (!titleVariants.size) {
    return html;
  }

  const stripTags = (value: string) => value.replace(/<[^>]+>/g, " ");

  let output = html;

  const leadingTextMatch = output.match(/^\s*([^<]+)/);
  if (leadingTextMatch) {
    const leadingText = leadingTextMatch[1];
    if (matchesTitle(leadingText, titleVariants)) {
      return output.slice(leadingTextMatch[0].length).trimStart();
    }
  }

  const headingMatch = output.match(/^\s*<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/i);
  if (headingMatch) {
    const headingText = stripTags(headingMatch[2]);
    if (matchesTitle(headingText, titleVariants)) {
      return output.slice(headingMatch[0].length).trimStart();
    }
  }

  const containerMatch = output.match(/^\s*<(div|section|article)[^>]*>\s*/i);
  if (containerMatch) {
    const prefixLength = containerMatch[0].length;
    const rest = output.slice(prefixLength);
    const restTextMatch = rest.match(/^\s*([^<]+)/);
    if (restTextMatch && matchesTitle(restTextMatch[1], titleVariants)) {
      return output.slice(0, prefixLength) + rest.slice(restTextMatch[0].length);
    }

    const innerHeadingMatch = rest.match(/^\s*<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/i);
    if (innerHeadingMatch) {
      const innerText = stripTags(innerHeadingMatch[2]);
      if (matchesTitle(innerText, titleVariants)) {
        return output.slice(0, prefixLength) + rest.slice(innerHeadingMatch[0].length);
      }
    }
  }

  return output;
}
