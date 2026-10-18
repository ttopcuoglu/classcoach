// The web app's modules read `import.meta.env` (Vite). A few of them are pure
// and reused here — scripts/tryInsightsNotes.ts builds the coach-notes input
// with the page's own model — so the server's typecheck has to know the shape.
// Nothing on the server reads it.
interface ImportMeta {
  readonly env: Record<string, string | boolean | undefined>
}
