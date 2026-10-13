"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function RootError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col">
      <ErrorFallback {...props} />
    </main>
  );
}
