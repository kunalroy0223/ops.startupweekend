"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState action={<Button variant="primary" onClick={reset}>Try again</Button>}>
      Something failed while loading this page. Nothing was changed. If it keeps happening, share this reference with an Admin:{" "}
      <code className="font-mono text-xs">{error.digest ?? "client"}</code>
    </ErrorState>
  );
}
