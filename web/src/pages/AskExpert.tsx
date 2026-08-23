const STARTER_QUESTIONS = [
  'How do I handle a student who constantly interrupts?',
  "What's a good way to set expectations on day one?",
  'A student refuses to put their phone away — what now?',
  'How do I de-escalate two students arguing in class?',
]

export default function AskExpert() {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Ask an Expert</h1>
        <p className="text-ink-soft">Ask a classroom management question, get a clear answer.</p>
      </div>

      <div className="flex flex-1 flex-col rounded-2xl border border-border bg-surface">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-ink-soft">Not sure where to start? Try one of these:</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {STARTER_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="rounded-full border border-border bg-canvas px-4 py-2 text-sm text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask a classroom management question..."
              className="flex-1 rounded-lg border border-border bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
            />
            <button
              type="button"
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
