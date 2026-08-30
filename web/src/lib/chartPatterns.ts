// Shared "unavailable" hatch style, split out of unavailableChart.tsx so that
// file only exports components (keeps React Fast Refresh working there).
export const HATCH_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, var(--color-border) 0, var(--color-border) 4px, transparent 4px, transparent 8px)',
  backgroundColor: 'var(--color-canvas)',
}
