type ReaderDocumentProps = {
  contentText: string;
  contentHtml?: string | null;
  mediaBase?: string | null;
};

type Paragraph = {
  text: string;
  start: number;
};

function splitParagraphs(contentText: string): Paragraph[] {
  const regex = /(?:[^\n]|\n(?!\n))+/g;
  const paragraphs: Paragraph[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(contentText)) !== null) {
    const text = match[0];
    if (!text.trim()) {
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

export default function ReaderDocument({ contentText, contentHtml, mediaBase }: ReaderDocumentProps) {
  if (contentHtml && contentHtml.trim()) {
    const html = normalizeMediaHtml(contentHtml, mediaBase);
    return (
      <article
        className="reader-article reader-article--html"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const paragraphs = splitParagraphs(contentText);

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
