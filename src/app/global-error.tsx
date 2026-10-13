"use client";

// Replaces the root layout when it fails, so it cannot rely on global styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontFamily: "system-ui, sans-serif",
          background: "#f6f7f9",
          color: "#1f2430",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Erro · GC Service Desk</title>
        <h1 style={{ fontSize: 20, margin: 0 }}>Algo deu errado</h1>
        <p style={{ margin: 0, color: "#667085" }}>
          O GC Service Desk encontrou um erro inesperado. Tente novamente em instantes.
        </p>
        {error.digest ? <code style={{ fontSize: 12, color: "#667085" }}>{error.digest}</code> : null}
        <button
          type="button"
          onClick={() => retry()}
          style={{
            border: 0,
            borderRadius: 8,
            padding: "10px 16px",
            background: "#facc00",
            color: "#262a33",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
