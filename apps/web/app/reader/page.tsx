import ReaderDocument from "@/components/ReaderDocument";

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
      <main style={{ padding: "40px 20px" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>
          Reader
        </h1>
        <p>Unable to load a document from the API.</p>
      </main>
    );
  }

  const section = data.sections[0];

  return (
    <main>
      <header style={{ padding: "32px 20px 0", maxWidth: "760px", margin: "0 auto" }}>
        <div style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {data.document.source_type}
        </div>
        <h1 style={{ fontSize: "28px", marginTop: "8px" }}>{data.document.title}</h1>
      </header>
      {section ? (
        <ReaderDocument contentText={section.content_text} />
      ) : (
        <p style={{ padding: "20px" }}>No sections found.</p>
      )}
    </main>
  );
}
