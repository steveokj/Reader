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

export default async function BookRedirect({ searchParams }: ReaderRedirectProps) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : undefined;
  if (resolvedParams?.documentId) {
    const params = new URLSearchParams();
    if (resolvedParams.sectionKey) {
      params.set("sectionKey", resolvedParams.sectionKey);
    }
    const query = params.toString();
    redirect(`/books/${resolvedParams.documentId}${query ? `?${query}` : ""}`);
  }
  redirect("/books");
}
