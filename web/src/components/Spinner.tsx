// A small spinning ring, inheriting the current text color so it drops
// into a button or line of text without its own color prop — used next to
// "Generating...", "Reviewing...", "Thinking..." etc. so a slow request
// reads as in-progress, not stuck.
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] opacity-70 ${className}`}
    />
  )
}
