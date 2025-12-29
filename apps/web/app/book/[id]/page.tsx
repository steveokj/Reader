import { redirect } from "next/navigation";

type BookIdRedirectProps = {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { sectionKey?: string } | Promise<{ sectionKey?: string }>;
};

export default async function BookIdRedirect({ params, searchParams }: BookIdRedirectProps) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearch = searchParams ? await Promise.resolve(searchParams) : undefined;
  const query = resolvedSearch?.sectionKey
    ? `?sectionKey=${encodeURIComponent(resolvedSearch.sectionKey)}`
    : "";
  redirect(`/books/${resolvedParams.id}${query}`);
}
