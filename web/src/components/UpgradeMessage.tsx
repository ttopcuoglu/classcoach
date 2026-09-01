import { Link } from 'react-router-dom'

const MARKER = 'Profile & Settings'

// Every upgrade-gated error from the backend (server/src/lib/billing.ts)
// names "Profile & Settings" as where to find the upgrade button — turn
// that phrase into a real link instead of just naming it in plain text.
export function UpgradeMessage({ text }: { text: string }) {
  const idx = text.indexOf(MARKER)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <Link to="/profile" className="font-semibold underline">
        {MARKER}
      </Link>
      {text.slice(idx + MARKER.length)}
    </>
  )
}
