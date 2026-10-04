/// A block's own heading, with an optional line of guidance under it.
///
/// Shared by Talk It Through, Practice and Look It Over because the three
/// pages ask the same shape of question — pick a topic, narrow it, confirm the
/// room — and used to answer it in three different type scales. Without a
/// heading per block each page read as one undifferentiated column of
/// controls, with no way to tell where one choice ended and the next began.
export default function SectionLabel({
  title,
  hint,
  /// For a block whose heading is a label rather than a question — the small
  /// terracotta eyebrow the rest of the app uses for section kickers.
  kicker,
}: {
  title: string
  hint?: string
  kicker?: boolean
}) {
  return (
    <div>
      <p
        className={
          kicker
            ? 'text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600'
            : 'font-heading text-base font-bold text-forest'
        }
      >
        {title}
      </p>
      {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
    </div>
  )
}
