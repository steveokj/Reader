type ReaderDocumentProps = {
  contentText: string;
  contentHtml?: string | null;
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

export default function ReaderDocument({ contentText, contentHtml }: ReaderDocumentProps) {
  if (contentHtml && contentHtml.trim()) {
    return (
      <article
        className="reader-article reader-article--html"
        dangerouslySetInnerHTML={{ __html: contentHtml }}
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
