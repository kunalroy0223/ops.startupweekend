"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, background: "#f4f6f3", color: "#000" }}>
        <h1 style={{ fontSize: 24 }}>Inhub Workspace hit an unexpected error.</h1>
        <p>Your data is safe. Try again, and contact an Admin if it keeps happening.</p>
        <button onClick={reset} style={{ padding: "10px 16px", border: "2px solid #000", background: "#000", color: "#fff", boxShadow: "3px 3px 0 #39c463" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
