import DocumentDetailClient from "@/components/DocumentDetailClient";

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

type Selection = {
  id: number;
  document_id: number;
  section_id: number;
  selector: {
    position: { start: number; end: number };
    quote: { exact: string; prefix: string; suffix: string };
  };
  created_at: string;
};

type Addition = {
  id: number;
  selection_id: number;
  type: string;
  title?: string | null;
  text_content?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type Marker = {
  id: number;
  target_type: string;
  target_id: number;
  kind: string;
  created_at: string;
};

type SelectionBundle = {
  selection: Selection;
  additions: Addition[];
  markers: Marker[];
  additionMarkers: Record<number, Marker[]>;
};

async function fetchDocumentDetail(documentId: string) {
  const response = await fetch(`${API_BASE}/documents/${documentId}`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as { document: Document; sections: DocumentSection[] };
}

async function fetchSelections(documentId: number): Promise<Selection[]> {
  const response = await fetch(`${API_BASE}/selections?document_id=${documentId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { selections?: Selection[] };
  return data.selections ?? [];
}

async function fetchAdditions(selectionId: number): Promise<Addition[]> {
  const response = await fetch(`${API_BASE}/additions?selection_id=${selectionId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { additions?: Addition[] };
  return data.additions ?? [];
}

async function fetchMarkers(targetType: string, targetId: number): Promise<Marker[]> {
  const response = await fetch(
    `${API_BASE}/markers?target_type=${targetType}&target_id=${targetId}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { markers?: Marker[] };
  return data.markers ?? [];
}

type DocumentDetailPageProps = {
  params: { id: string } | Promise<{ id: string }>;
};

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const detail = await fetchDocumentDetail(resolvedParams.id);
  if (!detail) {
    return (
      <main className="reader-main documents-page">
        <header className="reader-header documents-header">
          <div className="reader-kicker">Documents</div>
          <h1 className="reader-title">Not found</h1>
        </header>
        <div className="empty-state">Unable to load that document.</div>
      </main>
    );
  }

  const selections = await fetchSelections(detail.document.id);
  const bundles = await Promise.all(
    selections.map(async (selection) => {
      const [additions, markers] = await Promise.all([
        fetchAdditions(selection.id),
        fetchMarkers("selection", selection.id),
      ]);
      const additionMarkerEntries = await Promise.all(
        additions.map(async (addition) => {
          const items = await fetchMarkers("addition", addition.id);
          return [addition.id, items] as const;
        })
      );
      return {
        selection,
        additions,
        markers,
        additionMarkers: Object.fromEntries(additionMarkerEntries),
      } as SelectionBundle;
    })
  );

  const defaultSectionKey = detail.sections[0]?.section_key ?? "0";
  const readHref = `/reader?documentId=${detail.document.id}&sectionKey=${defaultSectionKey}`;

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">{detail.document.source_type}</div>
        <h1 className="reader-title">{detail.document.title}</h1>
        <div className="document-meta">
          <span>Sections {detail.sections.length}</span>
          <span>Created {new Date(detail.document.created_at).toLocaleDateString()}</span>
        </div>
        <div className="document-actions">
          <a href={readHref} className="action-link">
            Read
          </a>
        </div>
      </header>
      <DocumentDetailClient
        document={detail.document}
        sections={detail.sections}
        bundles={bundles}
      />
    </main>
  );
}
