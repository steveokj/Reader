const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002";

type Document = {
  id: number;
  title: string;
  source_type: string;
  source_ref?: string | null;
  created_at: string;
};

async function fetchBooks(): Promise<Document[]> {
  const response = await fetch(`${API_BASE}/books`, { cache: "no-store" });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { documents?: Document[] };
  return data.documents ?? [];
}

export default async function BooksPage() {
  const books = await fetchBooks();

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Library</div>
        <h1 className="reader-title">Books</h1>
      </header>
      <section className="documents-grid">
        {books.length === 0 ? (
          <div className="empty-state">No books yet.</div>
        ) : (
          books.map((doc) => (
            <a key={doc.id} href={`/books/${doc.id}`} className="document-card">
              <div className="document-card__meta">{doc.source_type}</div>
              <div className="document-card__title">{doc.title}</div>
              <div className="document-card__hint">
                Added {new Date(doc.created_at).toISOString()}
              </div>
            </a>
          ))
        )}
      </section>
    </main>
  );
}
