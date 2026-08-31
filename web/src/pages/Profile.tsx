import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProfile, resetData, updateProfile } from '../lib/api'

export default function Profile() {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [gradeLevels, setGradeLevels] = useState('')
  const [subjects, setSubjects] = useState('')
  const [audioRetentionDays, setAudioRetentionDays] = useState<string>('')
  const [organizationName, setOrganizationName] = useState<string | null>(null)
  const [coachMemory, setCoachMemory] = useState<string | null>(null)
  const [coachMemoryEnabled, setCoachMemoryEnabled] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [clearingMemory, setClearingMemory] = useState(false)
  const [clearMemoryError, setClearMemoryError] = useState<string | null>(null)

  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setName(profile.name ?? '')
        setGradeLevels(profile.gradeLevels ?? '')
        setSubjects(profile.subjects ?? '')
        setAudioRetentionDays(profile.audioRetentionDays != null ? String(profile.audioRetentionDays) : '')
        setOrganizationName(profile.organization?.name ?? null)
        setCoachMemory(profile.coachMemory)
        setCoachMemoryEnabled(profile.coachMemoryEnabled)
      })
      .catch(() => setSaveError('Could not load your profile.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await updateProfile({
        name,
        gradeLevels,
        subjects,
        audioRetentionDays: audioRetentionDays ? Number(audioRetentionDays) : null,
        coachMemoryEnabled,
      })
      setSaved(true)
    } catch {
      setSaveError('Could not save your changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoining(true)
    setJoinError(null)
    try {
      const updated = await updateProfile({ joinCode })
      setOrganizationName(updated.organization?.name ?? null)
      setJoinCode('')
    } catch (err) {
      setJoinError((err as Error).message || 'Could not join. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      'This will permanently delete your saved scenarios, Q&A history, and profile from this device. This cannot be undone. Continue?',
    )
    if (!confirmed) return

    setResetting(true)
    setResetError(null)
    try {
      await resetData()
      setName('')
      setGradeLevels('')
      setSubjects('')
      setResetDone(true)
    } catch {
      setResetError('Could not reset your data. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  async function handleClearMemory() {
    const confirmed = window.confirm(
      'This clears everything Coach has noted about your recurring strengths and any ongoing challenges. Continue?',
    )
    if (!confirmed) return

    setClearingMemory(true)
    setClearMemoryError(null)
    try {
      const updated = await updateProfile({ clearCoachMemory: true })
      setCoachMemory(updated.coachMemory)
    } catch {
      setClearMemoryError('Could not clear this. Please try again.')
    } finally {
      setClearingMemory(false)
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-sm text-ink-soft">Loading your profile...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Profile & Settings</h1>
        <p className="text-ink-soft">Tell us about your classroom so coaching can be more relevant.</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
            placeholder="Your name"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Grade level(s)</span>
          <input
            type="text"
            value={gradeLevels}
            onChange={(e) => {
              setGradeLevels(e.target.value)
              setSaved(false)
            }}
            placeholder="e.g. 7th, 8th grade"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Subject(s) taught</span>
          <input
            type="text"
            value={subjects}
            onChange={(e) => {
              setSubjects(e.target.value)
              setSaved(false)
            }}
            placeholder="e.g. Math, Science"
            className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-brand-600">Saved.</span>}
          {saveError && <span className="text-sm text-warm-500">{saveError}</span>}
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">What Coach remembers</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Coach keeps a short, running note about your recurring strengths and any ongoing challenges, built from
          your Ask and Talk It Through conversations. It's never shown to anyone else.
        </p>

        {coachMemory ? (
          <p className="mt-3 rounded-lg border border-border bg-canvas p-4 text-sm text-ink-soft">{coachMemory}</p>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Nothing yet — this builds up as you use Ask and Talk It Through.</p>
        )}

        <label className="mt-4 flex items-center gap-2.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={coachMemoryEnabled}
            onChange={(e) => {
              setCoachMemoryEnabled(e.target.checked)
              setSaved(false)
            }}
            className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-400"
          />
          Let Coach remember things between conversations
        </label>
        <p className="mt-1 text-xs text-ink-soft">Use "Save changes" above to apply this.</p>

        {coachMemory && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleClearMemory}
              disabled={clearingMemory}
              className="rounded-lg border border-warm-500 px-4 py-2 text-sm font-semibold text-warm-500 transition-colors hover:bg-warm-100 disabled:opacity-60"
            >
              {clearingMemory ? 'Clearing...' : 'Clear what Coach remembers'}
            </button>
          </div>
        )}
        {clearMemoryError && <p className="mt-2 text-sm text-warm-500">{clearMemoryError}</p>}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">School</h2>
        {organizationName ? (
          <p className="mt-2 text-sm text-ink">
            Part of: <span className="font-semibold">{organizationName}</span>
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              If your school or district has a Wivoza agreement, enter its code to join.
            </p>
            <form onSubmit={handleJoin} className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="School code"
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </form>
            {joinError && <p className="mt-2 text-sm text-warm-500">{joinError}</p>}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">More</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            to="/cheat-sheet"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
          >
            Your Cheat Sheet
          </Link>
          <Link
            to="/first-30-days"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
          >
            First 30 Days
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Data</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Export your saved scenarios and starred Q&A, or clear your data from this device.
        </p>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Lesson Debrief retention</span>
          <select
            value={audioRetentionDays}
            onChange={(e) => {
              setAudioRetentionDays(e.target.value)
              setSaved(false)
            }}
            className="w-fit rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          >
            <option value="">Keep indefinitely</option>
            <option value="7">Delete after 7 days</option>
            <option value="30">Delete after 30 days</option>
            <option value="90">Delete after 90 days</option>
          </select>
          <span className="text-xs text-ink-soft">
            Applies to new Lesson Debrief transcripts and reports. Use "Save changes" above to apply this.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            to="/export"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
          >
            Export playbook
          </Link>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-lg border border-warm-500 px-4 py-2 text-sm font-semibold text-warm-500 transition-colors hover:bg-warm-100 disabled:opacity-60"
          >
            {resetting ? 'Resetting...' : 'Reset & clear data'}
          </button>
        </div>
        {resetDone && <p className="mt-2 text-sm text-brand-600">Your data has been cleared.</p>}
        {resetError && <p className="mt-2 text-sm text-warm-500">{resetError}</p>}
      </div>
    </div>
  )
}
