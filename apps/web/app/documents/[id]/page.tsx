import { redirect } from "next/navigation";

type DocumentRedirectProps = {
  params: { id: string } | Promise<{ id: string }>;
};

export default async function DocumentRedirect({ params }: DocumentRedirectProps) {
  const resolvedParams = await Promise.resolve(params);
  redirect(`/highlights/${resolvedParams.id}`);
}
