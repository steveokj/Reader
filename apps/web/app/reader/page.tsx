import ReaderClient from "@/components/ReaderClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Document = {
  id: number;
  title: string;
  source_type: string;
  source_ref?: string | null;
  created_at: string;
};

type DocumentSection = {
  id: number;
  document_id: number;
  section_key: string;
  title?: string | null;
  content_text: string;
  created_at: string;
};

async function fetchFirstDocument(): Promise<{
  document: Document;
  sections: DocumentSection[];
} | null> {
  const listRes = await fetch(`${API_BASE}/documents`, { cache: "no-store" });
  if (!listRes.ok) {
    return null;
  }
  const listData = (await listRes.json()) as { documents?: Document[] };
  const firstDoc = listData.documents?.[0];
  if (!firstDoc) {
    return null;
  }

  const detailRes = await fetch(`${API_BASE}/documents/${firstDoc.id}`, {
    cache: "no-store",
  });
  if (!detailRes.ok) {
    return null;
  }
  return (await detailRes.json()) as {
    document: Document;
    sections: DocumentSection[];
  };
}

export default async function ReaderPage() {
  const data = await fetchFirstDocument();

  if (!data) {
    return (
      <main className="reader-main">
        <h1 className="reader-title">Reader</h1>
        <p>Unable to load a document from the API.</p>
      </main>
    );
  }

  const section = data.sections[0];

  return (
    <main className="reader-main">
      <header className="reader-header">
        <div className="reader-kicker">{data.document.source_type}</div>
        <h1 className="reader-title">{data.document.title}</h1>
      </header>
      {section ? (
        <ReaderClient
          documentId={data.document.id}
          sectionId={section.id}
          contentText={section.content_text}
        />
      ) : (
        <p>No sections found.</p>
      )}
    </main>
  );
}
