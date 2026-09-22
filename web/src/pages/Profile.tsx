import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createBillingPortalSession,
  createCheckoutSession,
  deleteAccount,
  getProfile,
  getTelegramStatus,
  resetData,
  TALK_VOICES,
  updateProfile,
  type ExperienceLevel,
  type TelegramStatus,
  type UserProfile,
  type TalkVoice,
} from '../lib/api'
import TelegramConnect from '../components/TelegramConnect'
import { EXPERIENCE_OPTIONS } from '../lib/experience'

const SECTION_BADGES = ['bg-gold text-forest', 'bg-terracotta text-cream', 'bg-forest text-gold']

function SectionHeading({ n, title, description }: { n: number; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${
          SECTION_BADGES[(n - 1) % SECTION_BADGES.length]
        }`}
      >
        {n}
      </span>
      <div>
        <h2 className="font-heading text-xl font-bold text-forest">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
    </div>
  )
}

export default function Profile() {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [gradeLevels, setGradeLevels] = useState('')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null)
  const [subjects, setSubjects] = useState('')
  const [audioRetentionDays, setAudioRetentionDays] = useState<string>('')
  const [organizationName, setOrganizationName] = useState<string | null>(null)
  const [coachMemory, setCoachMemory] = useState<string | null>(null)
  const [coachMemoryEnabled, setCoachMemoryEnabled] = useState(true)
  const [talkVoice, setTalkVoice] = useState<TalkVoice | null>(null)
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null)
  const [plan, setPlan] = useState<'free' | 'plus'>('free')
  const [plusAccess, setPlusAccess] = useState<UserProfile['plusAccess']>(null)

  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

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

  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  const hasPlus = plusAccess != null || plan === 'plus'

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setName(profile.name ?? '')
        setGradeLevels(profile.gradeLevels ?? '')
        setExperienceLevel(profile.experienceLevel)
        setSubjects(profile.subjects ?? '')
        setAudioRetentionDays(profile.audioRetentionDays != null ? String(profile.audioRetentionDays) : '')
        setOrganizationName(profile.organization?.name ?? null)
        setCoachMemory(profile.coachMemory)
        setCoachMemoryEnabled(profile.coachMemoryEnabled)
        setTalkVoice(profile.talkVoice)
        setPlan(profile.plan)
        setPlusAccess(profile.plusAccess ?? null)
      })
      .catch(() => setSaveError('Could not load your profile.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Optional card: if this fails or the server has no bot, it just doesn't show.
    getTelegramStatus()
      .then(setTelegram)
      .catch(() => {})
  }, [])

  // The Telegram card only shows when the server has a bot, so the sections
  // after it are numbered around it.
  const showTelegram = telegram?.available === true
  const afterTelegram = showTelegram ? 1 : 0

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
        experienceLevel,
        audioRetentionDays: audioRetentionDays ? Number(audioRetentionDays) : null,
        coachMemoryEnabled,
        talkVoice,
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

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'This permanently deletes your account and everything in it — profile, conversations, lesson recordings, and reports. This cannot be undone. Continue?',
    )
    if (!confirmed) return

    setDeletingAccount(true)
    setDeleteAccountError(null)
    try {
      await deleteAccount()
      // The account (and its session) is gone server-side — a full
      // reload is simpler and more reliable here than threading a logout
      // callback down from App/Layout just for this one rare action.
      window.location.href = '/'
    } catch {
      setDeleteAccountError('Could not delete your account. Please try again.')
      setDeletingAccount(false)
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

  async function handleUpgrade() {
    setBillingLoading(true)
    setBillingError(null)
    try {
      const { url } = await createCheckoutSession()
      window.location.href = url
    } catch {
      setBillingError('Could not start checkout. Please try again.')
      setBillingLoading(false)
    }
  }

  async function handleManageBilling() {
    setBillingLoading(true)
    setBillingError(null)
    try {
      const { url } = await createBillingPortalSession()
      window.location.href = url
    } catch {
      setBillingError('Could not open billing management. Please try again.')
      setBillingLoading(false)
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-sm text-ink-soft">Loading your profile...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 rounded-3xl bg-forest p-6 text-cream sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Wivoza · Grow</p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold text-cream md:text-4xl">
            Profile & Settings<span className="text-gold">.</span>
          </h1>
          <p className="mt-1.5 text-cream/70">Tell us about your classroom so coaching can be more relevant.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-cream/5 p-5 ring-1 ring-cream/10">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Your plan</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                hasPlus ? 'bg-gold text-forest' : 'bg-cream/15 text-cream'
              }`}
            >
              {plusAccess === 'admin' ? 'Full access' : hasPlus ? 'Wivoza Plus' : 'Free'}
            </span>
          </div>
          <p className="text-sm text-cream/75">
            {plusAccess === 'admin'
              ? 'Platform admin — every feature is unlocked, with no limits.'
              : plusAccess === 'school'
                ? `Included through ${organizationName ?? 'your school'} — unlimited Lesson Debrief, Lesson Planning, Messages, and Coach's memory.`
                : hasPlus
                  ? 'Unlimited Lesson Debrief, Lesson Planning, Messages, and Coach\'s memory.'
                  : 'Unlimited Talk It Through and Ask & Practice, 3 Lesson Debrief recordings a month.'}
          </p>
          {plusAccess === 'admin' || plusAccess === 'school' || plusAccess === 'demo' ? null : plan === 'plus' ? (
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={billingLoading}
              className="self-start rounded-full border border-cream/30 px-4 py-2 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10 disabled:opacity-60"
            >
              {billingLoading ? 'Opening...' : 'Manage subscription'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={billingLoading}
              className="self-start rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90 disabled:opacity-60"
            >
              {billingLoading ? 'Please wait...' : 'Upgrade to Wivoza Plus — $9.99/month'}
            </button>
          )}
          {billingError && <p className="text-sm text-peach-tint">{billingError}</p>}
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <SectionHeading n={1} title="About you" description="Used to fit scenarios and advice to your classroom." />
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
            className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Years in the classroom</span>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setExperienceLevel(option.value)
                  setSaved(false)
                }}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  experienceLevel === option.value
                    ? 'border-forest bg-forest text-cream'
                    : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

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
            className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
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
            className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-forest">Saved.</span>}
          {saveError && <span className="text-sm text-terracotta-600">{saveError}</span>}
        </div>
      </form>

      <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <SectionHeading
          n={2}
          title="What Coach remembers"
          description="A short, running note about your recurring strengths and any ongoing challenges, built from your Ask, Talk It Through, and Lesson Debrief Reflect conversations. It's never shown to anyone else."
        />

        {coachMemory ? (
          <p className="mt-4 rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5 text-sm text-ink">{coachMemory}</p>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">Nothing yet — this builds up as you use these features.</p>
        )}

        <label className="mt-4 flex items-center gap-2.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={coachMemoryEnabled}
            onChange={(e) => {
              setCoachMemoryEnabled(e.target.checked)
              setSaved(false)
            }}
            className="h-4 w-4 rounded border-hairline accent-terracotta focus:ring-terracotta/40"
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
              className="rounded-full border border-terracotta px-4 py-2 text-sm font-semibold text-terracotta-600 transition-colors hover:bg-peach-tint disabled:opacity-60"
            >
              {clearingMemory ? 'Clearing...' : 'Clear what Coach remembers'}
            </button>
          </div>
        )}
        {clearMemoryError && <p className="mt-2 text-sm text-terracotta-600">{clearMemoryError}</p>}
      </div>

      <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <SectionHeading n={3} title="Coach's voice" description="Choose which voice Coach speaks with in Talk It Through." />
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TALK_VOICES.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => {
                setTalkVoice(v.value)
                setSaved(false)
              }}
              className={`group rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                (talkVoice ?? 'arcas') === v.value
                  ? 'border-forest bg-forest text-cream'
                  : 'border-hairline bg-cream text-ink hover:border-terracotta/40'
              }`}
            >
              <span className="font-semibold">{v.label}</span>
              <span className={`block text-xs ${(talkVoice ?? 'arcas') === v.value ? 'text-cream/70' : 'text-ink-soft'}`}>
                {v.description}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">Use "Save changes" above to apply this.</p>
      </div>

      {showTelegram && (
        <TelegramConnect
          status={telegram}
          onStatusChange={setTelegram}
          heading={
            <SectionHeading
              n={4}
              title="Coach on Telegram"
              description="Text Coach from Telegram, just like Talk It Through, and get Coach's check-ins there. Conversations are saved here too."
            />
          }
        />
      )}

      <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <SectionHeading n={4 + afterTelegram} title="School" />
        {organizationName ? (
          <p className="mt-3 text-sm text-ink">
            Part of: <span className="font-semibold">{organizationName}</span>
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-soft">
              If your school or district has a Wivoza agreement, enter its code to join.
            </p>
            <form onSubmit={handleJoin} className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="School code"
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none"
              />
              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </form>
            {joinError && <p className="mt-2 text-sm text-terracotta-600">{joinError}</p>}
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/cheat-sheet"
          className="group flex items-center gap-4 rounded-2xl bg-peach-tint/50 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-terracotta font-heading text-lg font-bold text-cream">
            ★
          </span>
          <div>
            <p className="font-heading text-base font-bold text-forest">Your Cheat Sheet</p>
            <p className="text-xs text-ink-soft">Go-to phrases, auto-built from your saved content.</p>
          </div>
        </Link>
        <Link
          to="/first-30-days"
          className="group flex items-center gap-4 rounded-2xl bg-mint-tint/50 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest font-heading text-sm font-bold text-gold">
            30
          </span>
          <div>
            <p className="font-heading text-base font-bold text-forest">First 30 Days</p>
            <p className="text-xs text-ink-soft">A short guided track to get grounded early.</p>
          </div>
        </Link>
      </div>

      <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <SectionHeading
          n={5 + afterTelegram}
          title="Your data"
          description="Export your saved scenarios and starred Q&A, or clear your data from this device."
        />

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Lesson Debrief retention</span>
          <select
            value={audioRetentionDays}
            onChange={(e) => {
              setAudioRetentionDays(e.target.value)
              setSaved(false)
            }}
            className="w-fit rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none"
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
            className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
          >
            Export playbook
          </Link>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-full border border-terracotta px-4 py-2 text-sm font-semibold text-terracotta-600 transition-colors hover:bg-peach-tint disabled:opacity-60"
          >
            {resetting ? 'Resetting...' : 'Reset & clear data'}
          </button>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
            className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-colors hover:opacity-90 disabled:bg-hairline disabled:text-ink-soft"
          >
            {deletingAccount ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
        {resetDone && <p className="mt-2 text-sm text-forest">Your data has been cleared.</p>}
        {resetError && <p className="mt-2 text-sm text-terracotta-600">{resetError}</p>}
        {deleteAccountError && <p className="mt-2 text-sm text-terracotta-600">{deleteAccountError}</p>}
      </div>
    </div>
  )
}
