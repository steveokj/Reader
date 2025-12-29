import DocumentIngestForm from "@/components/DocumentIngestForm";

export default function DocumentNewPage() {
  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Documents</div>
        <h1 className="reader-title">Create or Upload</h1>
      </header>
      <DocumentIngestForm />
    </main>
  );
}
