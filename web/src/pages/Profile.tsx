export default function Profile() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Profile & Settings</h1>
        <p className="text-ink-soft">Tell us about your classroom so coaching can be more relevant.</p>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Name</span>
          <input
            type="text"
            placeholder="Your name"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Grade level(s)</span>
          <input
            type="text"
            placeholder="e.g. 7th, 8th grade"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Subject(s) taught</span>
          <input
            type="text"
            placeholder="e.g. Math, Science"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>

        <button
          type="button"
          className="self-start rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Save changes
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Data</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Clear your saved scenarios, Q&A history, and profile from this device.
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-warm-500 px-4 py-2 text-sm font-semibold text-warm-500 transition-colors hover:bg-warm-100"
        >
          Reset & clear data
        </button>
      </div>
    </div>
  )
}
