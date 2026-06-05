"use client";

export const dynamic = "force-dynamic";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: 32, textAlign: "center" }}>
          <h2 style={{ marginBottom: 16 }}>Something went wrong</h2>
          <button
            onClick={reset}
            style={{
              padding: "8px 24px",
              background: "#18181b",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
