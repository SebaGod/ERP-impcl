"use client";

/**
 * El último recurso.
 *
 * Solo aparece si se cayó el layout raíz, es decir cuando ya falló todo
 * lo que envuelve a las demás pantallas. Por eso no importa nada: ni el
 * componente compartido, ni los tokens de color, ni la hoja de estilos.
 * Un fallback que necesita que el CSS haya cargado no es un fallback —
 * si lo que se rompió fue justamente eso, queda texto negro sobre fondo
 * blanco explicando nada.
 *
 * Los estilos van en línea por la misma razón, y reemplaza al layout
 * raíz completo, así que le tocan sus propios <html> y <body>.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 8px" }}>
            La aplicación no pudo cargar
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#475569",
              margin: "0 0 20px",
            }}
          >
            Fue una falla al arrancar, no en tus datos: nada de lo que tenías
            guardado se tocó. Reintenta y, si sigue igual, avísanos con el
            código de abajo.
          </p>

          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "#0f172a",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: "20px",
                fontSize: "0.75rem",
                color: "#64748b",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                wordBreak: "break-all",
              }}
            >
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
