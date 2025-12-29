import { redirect } from "next/navigation";

type ReaderRedirectProps = {
  searchParams?: {
    documentId?: string;
    sectionKey?: string;
  } | Promise<{
    documentId?: string;
    sectionKey?: string;
  }>;
};

export default async function ReaderRedirect({ searchParams }: ReaderRedirectProps) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : undefined;
  const params = new URLSearchParams();
  if (resolvedParams?.documentId) {
    params.set("documentId", resolvedParams.documentId);
  }
  if (resolvedParams?.sectionKey) {
    params.set("sectionKey", resolvedParams.sectionKey);
  }
  const query = params.toString();
  redirect(`/book${query ? `?${query}` : ""}`);
}
