"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function DocumentIngestForm() {
  const router = useRouter();
  const [epubTitle, setEpubTitle] = useState("");
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEpubSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!epubFile) {
      setError("Choose an EPUB file to upload.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", epubFile);
    if (epubTitle.trim()) {
      formData.append("title", epubTitle.trim());
    }
    try {
      const response = await fetch(`${API_BASE}/documents/ingest/epub`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Upload failed.");
      }
      const data = (await response.json()) as { document?: { id: number } };
      if (data.document?.id) {
        router.push(`/documents/${data.document.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArticleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!articleUrl.trim() && !articleText.trim()) {
      setError("Provide a URL or paste article text.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/documents/ingest/article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: articleTitle.trim() || null,
          url: articleUrl.trim() || null,
          text: articleText.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Import failed.");
      }
      const data = (await response.json()) as { document?: { id: number } };
      if (data.document?.id) {
        router.push(`/documents/${data.document.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="ingest-grid">
      <form className="ingest-card" onSubmit={handleEpubSubmit}>
        <div className="ingest-card__title">Upload EPUB</div>
        <label className="ingest-label">
          Title (optional)
          <input
            className="ingest-input"
            value={epubTitle}
            onChange={(event) => setEpubTitle(event.target.value)}
            placeholder="EPUB title"
          />
        </label>
        <label className="ingest-label">
          File
          <input
            className="ingest-input"
            type="file"
            accept=".epub"
            onChange={(event) => setEpubFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="action-link" disabled={isSubmitting}>
          Upload EPUB
        </button>
      </form>

      <form className="ingest-card" onSubmit={handleArticleSubmit}>
        <div className="ingest-card__title">Import Article</div>
        <label className="ingest-label">
          Title (optional)
          <input
            className="ingest-input"
            value={articleTitle}
            onChange={(event) => setArticleTitle(event.target.value)}
            placeholder="Article title"
          />
        </label>
        <label className="ingest-label">
          URL
          <input
            className="ingest-input"
            value={articleUrl}
            onChange={(event) => setArticleUrl(event.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <label className="ingest-label">
          Or paste text
          <textarea
            className="ingest-textarea"
            value={articleText}
            onChange={(event) => setArticleText(event.target.value)}
            placeholder="Paste article text here..."
          />
        </label>
        <button type="submit" className="action-link" disabled={isSubmitting}>
          Import Article
        </button>
      </form>

      {error ? <div className="ingest-error">{error}</div> : null}
    </section>
  );
}
