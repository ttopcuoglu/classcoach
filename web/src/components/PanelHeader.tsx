import type { ReactNode } from 'react'

// The dark green band that opens a feature's input card, the same cover the
// printable reports and Lesson Debrief use. It bleeds to the card's edges, so
// the card it sits in needs `overflow-hidden` and `p-6`.
export function PanelHeader({
  eyebrow,
  title,
  children,
  as: Heading = 'h2',
  className = 'mb-2',
}: {
  eyebrow: string
  title: string
  children?: ReactNode
  as?: 'h1' | 'h2'
  className?: string
}) {
  return (
    <div className={`-mx-6 -mt-6 bg-forest px-6 py-6 text-cream sm:px-8 ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <Heading className="mt-2 font-heading text-2xl font-bold text-cream sm:text-3xl">
        {title}
        <span className="text-gold">.</span>
      </Heading>
      {children && <div className="mt-1.5 max-w-2xl text-sm text-cream/70">{children}</div>}
    </div>
  )
}
