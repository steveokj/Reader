type ReaderDocumentProps = {
  contentText: string;
};

export default function ReaderDocument({ contentText }: ReaderDocumentProps) {
  const paragraphs = contentText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <article
      style={{
        maxWidth: "760px",
        margin: "40px auto",
        padding: "0 20px 48px",
        lineHeight: 1.65,
        fontSize: "18px",
      }}
    >
      {paragraphs.map((paragraph, index) => (
        <p key={index} style={{ marginBottom: "1rem" }}>
          {paragraph}
        </p>
      ))}
    </article>
  );
}
