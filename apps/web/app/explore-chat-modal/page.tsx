"use client";

import { useRouter, useSearchParams } from "next/navigation";

import ExploreChatModal from "@/components/ExploreChatModal";

export default function ExploreChatModalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectionText = searchParams.get("selection");

  return (
    <main className="reader-main">
      <ExploreChatModal
        open
        selectionText={selectionText}
        onClose={() => router.push("/books")}
      />
    </main>
  );
}
