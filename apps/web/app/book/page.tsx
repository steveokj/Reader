import ReaderClient from "@/components/ReaderClient";
import ReaderSectionPicker from "@/components/ReaderSectionPicker";
import { stripDocumentTitleFromHtml } from "@/lib/reader/stripDocumentTitle";

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
  const detailRes = await fetch(`${API_BASE}/books/${documentId}`, {
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

async function fetchFirstDocument(): Promise<{
  document: Document;
  sections: DocumentSection[];
} | null> {
  const listRes = await fetch(`${API_BASE}/books`, { cache: "no-store" });
  if (!listRes.ok) {
    return null;
  }
  const listData = (await listRes.json()) as { documents?: Document[] };
  const firstDoc = listData.documents?.[0];
  if (!firstDoc) {
    return null;
  }
  return fetchDocumentById(firstDoc.id);
}

type ReaderPageProps = {
  searchParams?: {
    documentId?: string;
    sectionKey?: string;
  } | Promise<{
    documentId?: string;
    sectionKey?: string;
  }>;
};

export default async function ReaderPage({ searchParams }: ReaderPageProps) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : undefined;
  const documentId = resolvedParams?.documentId ? Number(resolvedParams.documentId) : null;
  const data = documentId ? await fetchDocumentById(documentId) : await fetchFirstDocument();

  if (!data) {
    return (
      <main className="reader-main">
        <h1 className="reader-title">Reader</h1>
        <p>Unable to load a document from the API.</p>
      </main>
    );
  }

  const requestedSectionKey = resolvedParams?.sectionKey ?? null;

  const sections = data.sections.map((section) =>
    section.content_html
      ? {
          ...section,
          content_html: stripDocumentTitleFromHtml(section.content_html, data.document.title),
        }
      : section
  );

  return (
    <main className="reader-main">
      <header className="reader-header">
        <div className="reader-kicker">{data.document.source_type}</div>
        <h1 className="reader-title">{data.document.title}</h1>
      </header>
      <ReaderSectionPicker
        documentId={data.document.id}
        sections={sections}
        activeKey={requestedSectionKey}
      />
      {sections.length ? (
        <ReaderClient
          documentId={data.document.id}
          sections={sections}
          initialSectionKey={requestedSectionKey}
        />
      ) : (
        <p>No sections found.</p>
      )}
    </main>
  );
}
