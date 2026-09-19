import { useEffect, useState } from 'react'

// Everything a teacher has made with one tool, newest first, for the page's
// past list. The item open on the page is folded in whenever it changes —
// a new draft, a chat revision, a star — so the list never shows a stale
// copy and a page's handlers don't have to update two places.
export function usePastItems<T extends { id: string }>(load: () => Promise<T[]>, current: T | null) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [seen, setSeen] = useState<T | null>(current)

  if (current !== seen) {
    setSeen(current)
    if (current) {
      setItems((prev) =>
        prev.some((i) => i.id === current.id) ? prev.map((i) => (i.id === current.id ? current : i)) : [current, ...prev],
      )
    }
  }

  useEffect(() => {
    load()
      .then((loaded) =>
        // Anything made while the list was loading is already newer.
        setItems((prev) => [...prev, ...loaded.filter((l) => !prev.some((p) => p.id === l.id))]),
      )
      .catch(() => {})
      .finally(() => setLoading(false))
    // Loaded once per visit to the tool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { items, loading }
}
