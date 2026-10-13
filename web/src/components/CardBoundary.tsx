import { Component, type ErrorInfo, type ReactNode } from 'react'

/// Keeps one broken card from taking a whole page down.
///
/// The admin dashboard is a column of independent cards, each reading its own
/// slice of data, and a render error in any one of them blanked the entire
/// page — no heading, no other cards, nothing. That was found by serving one
/// endpoint the wrong shape: a card read `data.items` on an array, threw, and
/// a principal would have seen an empty screen with no indication which part
/// failed or that the rest of the page was fine.
///
/// A failed card now says so in place, keeping its number and title so the
/// page still reads as the numbered sequence it is, and every other card
/// carries on. The point is not to hide the failure — it is to stop one
/// card's failure from being reported as the whole page's.
///
/// Deliberately a class: `getDerivedStateFromError` and `componentDidCatch`
/// have no hook equivalent, and this needs no library to do one thing.
type Props = {
  /// Shown in the fallback so a principal can say which card failed, and so
  /// the numbered sequence does not silently skip an entry.
  n?: number
  title?: string
  children: ReactNode
}

type State = { failed: boolean }

export class CardBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console rather than sent anywhere: this page is read by one
    // person in one school, and the value of the trace is to whoever is
    // debugging with them.
    console.error(`[admin] card "${this.props.title ?? 'untitled'}" failed to render:`, error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="rounded-3xl border border-dashed border-hairline bg-cream-card p-6">
        <div className="flex items-start gap-3.5">
          {this.props.n != null && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hairline font-heading text-base font-bold text-ink-soft">
              {this.props.n}
            </span>
          )}
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight text-ink-soft">
              {this.props.title ?? 'This section'}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              This part of the page couldn't be shown. Everything else here is still accurate — reloading usually
              clears it, and nothing is wrong with your school's data.
            </p>
          </div>
        </div>
      </section>
    )
  }
}
