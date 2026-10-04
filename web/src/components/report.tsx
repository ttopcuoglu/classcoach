import { Link } from 'react-router-dom'

// Shared chrome for every printable report (Lesson Debrief, Talk It Through,
// Ask & Practice, Lesson Planning, Assignment Coach, Communication Coach).
//
// Two constraints drive all of it. It has to survive the printer: coloured
// backgrounds only render because index.css sets print-color-adjust: exact
// globally, and no individual card is ever sliced across a page. Sections do
// NOT each force a new page, and are not kept whole either — both were tried,
// and printing all thirteen reports measured the cost: page-per-section ran
// 71 pages at about a third full, and keeping tall sections unbroken still
// left half-blank sheets wherever one did not fit. And it has to stay honest:
// where a value could not be determined, print a dash and its reason rather
// than a zero.

export type Accent = { band: string; chip: string; tint: string; ink: string }

export const ACCENTS: Record<'terracotta' | 'gold' | 'mint' | 'forest', Accent> = {
  terracotta: { band: 'bg-terracotta', chip: 'bg-peach-tint', tint: 'bg-peach-tint/50', ink: 'text-terracotta-600' },
  gold: { band: 'bg-gold', chip: 'bg-gold-tint', tint: 'bg-gold-tint/50', ink: 'text-terracotta-600' },
  mint: { band: 'bg-brand-500', chip: 'bg-mint-tint', tint: 'bg-mint-tint/50', ink: 'text-forest' },
  forest: { band: 'bg-forest', chip: 'bg-mint-tint', tint: 'bg-mint-tint/40', ink: 'text-forest' },
}

// Cycled so consecutive sections never share a colour — the accent is how a
// teacher tells which page they are holding.
export const ACCENT_CYCLE: Accent[] = [ACCENTS.terracotta, ACCENTS.gold, ACCENTS.mint, ACCENTS.forest]

// Chrome prints its own header and footer — the date, the page title, and the
// page's URL including the record's id — in the page margin, and every teacher
// who prints with default settings gets them. It only omits them when the page
// margin is zero. A zero margin alone puts page two's first line 0.6mm from the
// paper edge, inside the area most printers cannot reach, so the report's own
// padding is repeated on every page with box-decoration-break: clone.
//
// Wrapped in @supports so a browser that cannot repeat the padding (Safari)
// skips the whole thing and prints exactly as it did before — never worse.
// Rendered by the shell rather than put in index.css so the zero margin
// applies only while a report is on screen, not to anything else printed.
// Measured in Chrome: no header or footer, 14.6mm at the top of page two.
const PRINT_PAGE_CSS = `
@supports (box-decoration-break: clone) {
  @page { margin: 0; }
  @media print {
    .report-print-page { padding: 14mm 12mm; box-decoration-break: clone; }
  }
}
`

export function ReportShell({ backTo, children }: { backTo: string; children: React.ReactNode }) {
  return (
    <div className="report-print-page min-h-screen bg-cream px-6 py-8 text-ink print:bg-white print:p-0">
      <style>{PRINT_PAGE_CSS}</style>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to={backTo} className="text-sm font-medium text-ink-soft hover:text-ink">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Print / Save as PDF
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ReportCover({
  eyebrow,
  title,
  accentTitle,
  meta,
  badge,
}: {
  eyebrow: string
  title: string
  accentTitle?: string
  meta?: string
  badge?: string
}) {
  return (
    <header className="overflow-hidden rounded-3xl bg-forest p-8 text-cream">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{eyebrow}</p>
      <h1 className="mt-3 font-heading text-4xl font-extrabold leading-tight">
        {title}
        {accentTitle ? <span className="text-gold"> · {accentTitle}</span> : null}
      </h1>
      {meta && <p className="mt-2 text-sm text-cream/70">{meta}</p>}
      {badge && (
        <p className="mt-4 inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">
          {badge}
        </p>
      )}
    </header>
  )
}

export function ReportSection({
  n,
  title,
  blurb,
  accent,
  children,
}: {
  n: number
  title: string
  blurb?: string
  accent: Accent
  children: React.ReactNode
}) {
  return (
    <section className="mt-10 print:mt-7">
      {/* break-after-avoid keeps the numbered heading from being stranded as
          the last thing on a page. The section itself is allowed to flow
          across pages — every card inside it carries break-inside-avoid, so
          nothing gets sliced, and forbidding the split just pushed a tall
          section wholesale to the next sheet and left half a page blank. */}
      <div className="flex items-center gap-4 break-after-avoid">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent.band} font-heading text-xl font-bold text-cream`}
        >
          {n}
        </span>
        <div>
          <h2 className="font-heading text-2xl font-extrabold leading-tight text-forest">{title}</h2>
          {blurb && <p className="mt-0.5 text-sm text-ink-soft">{blurb}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

// A dash here is a deliberate statement, so `hint` prints alongside it rather
// than leaving the reader to assume a rendering failure.
export function StatTile({
  label,
  value,
  unit,
  hint,
  accent,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  accent: Accent
}) {
  return (
    <div className={`break-inside-avoid rounded-2xl ${accent.chip} p-5`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-forest/60">{label}</p>
      <p className="mt-1 font-heading text-4xl font-extrabold leading-none text-forest">
        {value}
        {unit ? <span className="text-xl font-bold"> {unit}</span> : null}
      </p>
      {hint && <p className="mt-2 text-xs leading-snug text-forest/70">{hint}</p>}
    </div>
  )
}

export function Callout({ label, body, accent }: { label: string; body: string; accent: Accent }) {
  return (
    <div className={`mt-4 break-inside-avoid rounded-2xl ${accent.tint} p-5`}>
      <p className={`text-[11px] font-bold uppercase tracking-wide ${accent.ink}`}>{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{body}</p>
    </div>
  )
}

// Long free text (a lesson plan, a drafted message, extracted slide text). Kept
// on white so a full page of it stays readable in print.
//
// Unlike the cards, this one is allowed to break across pages. Keeping it whole
// meant a submitted lesson plan too long for the space left on page one was
// pushed entirely onto page two, leaving page one blank beneath the cover —
// and anything longer than a page gets split regardless, so the rule bought
// nothing in exchange.
export function Prose({ body }: { body: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-5">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{body}</p>
    </div>
  )
}

export function ChipRow({ items, accent }: { items: string[]; accent: Accent }) {
  if (!items.length) return null
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {items.map((t) => (
        <span key={t} className={`rounded-full ${accent.chip} px-3 py-1 text-xs font-bold text-forest`}>
          {t}
        </span>
      ))}
    </div>
  )
}

// One turn of a coaching conversation. Roles are visually distinct so a
// printed transcript is readable without colour cues alone.
export function TurnBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const mine = role === 'user'
  return (
    <div className={`break-inside-avoid rounded-2xl p-4 ${mine ? 'bg-mint-tint/60' : 'border border-hairline bg-white'}`}>
      <p className={`text-[11px] font-bold uppercase tracking-wide ${mine ? 'text-forest' : 'text-terracotta-600'}`}>
        {mine ? 'You' : 'Coach'}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{text}</p>
    </div>
  )
}

// print:mt-5 is a tighter gap on paper: at mt-10 the footer regularly missed
// the bottom of the last page by a few millimetres and took a whole extra
// sheet to print one line.
export function ReportFooter({ note }: { note?: string }) {
  return (
    <footer className="mt-10 break-inside-avoid border-t border-hairline pt-4 text-center text-xs text-ink-soft print:mt-5">
      {note ?? 'Generated by Wivoza · wivoza.com · This report is private to you. No administrator sees it.'}
    </footer>
  )
}

export function ReportState({ text }: { text: string }) {
  return <p className="p-8 text-sm text-ink-soft">{text}</p>
}

export function formatReportDate(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
