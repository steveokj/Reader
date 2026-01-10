import { redirect } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ReadingProgress = {
  document_id: number;
  section_id: number;
  position_start: number;
  position_end: number;
  updated_at: string;
};

async function fetchLastProgress(): Promise<ReadingProgress | null> {
  const response = await fetch(`${API_BASE}/books/last`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { progress?: ReadingProgress | null };
  return data.progress ?? null;
}

export default async function LastBookRoute() {
  const progress = await fetchLastProgress();
  if (!progress?.document_id) {
    redirect("/books");
  }
  redirect(`/books/${progress.document_id}`);
}
