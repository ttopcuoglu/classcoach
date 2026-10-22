import { useEffect, useRef } from 'react'

/// A full-screen dialog layer: Escape or a click on the backdrop closes it,
/// and focus moves into it once when it opens.
export default function Overlay({ children, onClose, labelledBy }: { children: React.ReactNode; onClose: () => void; labelledBy: string }) {
  const box = useRef<HTMLDivElement>(null)
  // Read through a ref so a parent re-render can't re-run this and pull focus
  // back off whatever the teacher has moved to inside the dialog.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 overflow-y-auto bg-forest/45 px-4 pt-6 focus:outline-none md:px-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  )
}
