const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Document = {
  id: number;
  title: string;
  source_type: string;
  source_ref?: string | null;
  created_at: string;
};

async function fetchDocuments(): Promise<Document[]> {
  const response = await fetch(`${API_BASE}/documents`, { cache: "no-store" });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { documents?: Document[] };
  return data.documents ?? [];
}

export default async function DocumentsPage() {
  const documents = await fetchDocuments();

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Library</div>
        <h1 className="reader-title">Documents</h1>
      </header>
      <section className="documents-grid">
        <div className="document-card document-card--create">
          <div className="document-card__meta">Create / Upload</div>
          <div className="document-card__title">Add a new document</div>
          <div className="document-card__hint">Coming soon.</div>
        </div>
        {documents.length === 0 ? (
          <div className="empty-state">No documents yet.</div>
        ) : (
          documents.map((doc) => (
            <a key={doc.id} href={`/documents/${doc.id}`} className="document-card">
              <div className="document-card__meta">{doc.source_type}</div>
              <div className="document-card__title">{doc.title}</div>
              <div className="document-card__hint">
                Added {new Date(doc.created_at).toLocaleDateString()}
              </div>
            </a>
          ))
        )}
      </section>
    </main>
  );
}
