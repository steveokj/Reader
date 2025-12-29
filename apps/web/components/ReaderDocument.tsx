type ReaderDocumentProps = {
  contentText: string;
  contentHtml?: string | null;
  mediaBase?: string | null;
  documentTitle?: string | null;
};

type Paragraph = {
  text: string;
  start: number;
};

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

function splitParagraphs(contentText: string, documentTitle?: string | null): Paragraph[] {
  const regex = /(?:[^\n]|\n(?!\n))+/g;
  const paragraphs: Paragraph[] = [];
  let match: RegExpExecArray | null;
  const titleVariants = documentTitle ? buildTitleVariants(documentTitle) : new Set<string>();

  while ((match = regex.exec(contentText)) !== null) {
    const text = match[0];
    if (!text.trim()) {
      continue;
    }
    if (!paragraphs.length && titleVariants.size && titleVariants.has(normalizeTitle(text))) {
      continue;
    }
    paragraphs.push({ text, start: match.index });
  }

  return paragraphs;
}

function normalizeMediaHtml(contentHtml: string, mediaBase?: string | null) {
  if (!mediaBase) {
    return contentHtml;
  }
  const base = mediaBase.replace(/\/+$/, "");
  if (!base) {
    return contentHtml;
  }
  return contentHtml.replace(/src=(["'])\/media\//gi, `src=$1${base}/media/`);
}

function stripDocumentTitleFromHtml(html: string, documentTitle?: string | null) {
  if (!documentTitle || typeof document === "undefined") {
    return html;
  }
  const titleVariants = buildTitleVariants(documentTitle);
  if (!titleVariants.size) {
    return html;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  const content = template.content;

  let node: ChildNode | null = content.firstChild;
  while (node && node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim()) {
    node = node.nextSibling;
  }
  if (node && node.nodeType === Node.TEXT_NODE) {
    const textValue = node.textContent ?? "";
    if (titleVariants.has(normalizeTitle(textValue))) {
      node.remove();
    }
  }

  const firstElement = content.firstElementChild as HTMLElement | null;
  if (firstElement) {
    const tagName = firstElement.tagName.toUpperCase();
    const firstText = firstElement.textContent ?? "";
    if (
      (/^H[1-6]$/.test(tagName) || tagName === "P") &&
      titleVariants.has(normalizeTitle(firstText))
    ) {
      firstElement.remove();
    } else if (tagName === "DIV" || tagName === "SECTION" || tagName === "ARTICLE") {
      const innerFirst = firstElement.firstElementChild as HTMLElement | null;
      if (innerFirst) {
        const innerTag = innerFirst.tagName.toUpperCase();
        const innerText = innerFirst.textContent ?? "";
        if (
          (/^H[1-6]$/.test(innerTag) || innerTag === "P") &&
          titleVariants.has(normalizeTitle(innerText))
        ) {
          innerFirst.remove();
        }
      }
    }
  }

  return template.innerHTML.trim();
}

export default function ReaderDocument({
  contentText,
  contentHtml,
  mediaBase,
  documentTitle,
}: ReaderDocumentProps) {
  if (contentHtml && contentHtml.trim()) {
    let html = normalizeMediaHtml(contentHtml, mediaBase);
    html = stripDocumentTitleFromHtml(html, documentTitle);
    return (
      <article
        className="reader-article reader-article--html"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const paragraphs = splitParagraphs(contentText, documentTitle);

  return (
    <article className="reader-article">
      {paragraphs.map((paragraph, index) => (
        <p
          key={`${paragraph.start}-${index}`}
          className="reader-paragraph"
          data-paragraph
          data-start={paragraph.start}
        >
          {paragraph.text}
        </p>
      ))}
    </article>
  );
}
