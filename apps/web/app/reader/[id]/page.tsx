import ReaderClient from "@/components/ReaderClient";
import ReaderSectionPicker from "@/components/ReaderSectionPicker";

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
  content_html?: string | null;
  created_at: string;
};

async function fetchDocumentById(documentId: number): Promise<{
  document: Document;
  sections: DocumentSection[];
} | null> {
  const detailRes = await fetch(`${API_BASE}/documents/${documentId}`, {
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

type ReaderRouteProps = {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { sectionKey?: string } | Promise<{ sectionKey?: string }>;
};

export default async function ReaderRoute({ params, searchParams }: ReaderRouteProps) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearch = searchParams ? await Promise.resolve(searchParams) : undefined;
  const documentId = Number(resolvedParams.id);
  const data = await fetchDocumentById(documentId);

  if (!data) {
    return (
      <main className="reader-main">
        <h1 className="reader-title">Reader</h1>
        <p>Unable to load a document from the API.</p>
      </main>
    );
  }

  const requestedSectionKey = resolvedSearch?.sectionKey ?? null;

  return (
    <main className="reader-main">
      <header className="reader-header">
        <div className="reader-kicker">{data.document.source_type}</div>
        <h1 className="reader-title">{data.document.title}</h1>
      </header>
      <ReaderSectionPicker
        documentId={data.document.id}
        sections={data.sections}
        activeKey={requestedSectionKey}
      />
      {data.sections.length ? (
        <ReaderClient
          documentId={data.document.id}
          sections={data.sections}
          initialSectionKey={requestedSectionKey}
        />
      ) : (
        <p>No sections found.</p>
      )}
    </main>
  );
}
