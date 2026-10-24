import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { connectLti, getLtiPending, logout, type LtiPending, type UserProfile } from '../lib/api'
import AuthCard from '../components/AuthCard'
import { Spinner } from '../components/Spinner'

// The first time a teacher opens Wivoza from their school's LMS (Canvas,
// Schoology, Brightspace, Moodle, Blackboard). The LMS has proved who they are
// there; this is where they say which Wivoza account that is — signed in to
// it, so an LMS account can only ever be joined to an account its owner
// controls. After this, the Wivoza link in the LMS signs them
// straight in. Signed out, they sign in or create an account right here
// first; the link from the LMS waits.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'

export default function LtiConnect({
  user,
  onSignedIn,
  onSignedOut,
}: {
  user: UserProfile | null
  onSignedIn: () => void
  onSignedOut: () => void
}) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [info, setInfo] = useState<LtiPending | null>(null)
  // Joining the school is offered ticked: it is why most teachers are here,
  // and the line under it says exactly what the school can see.
  const [joinSchool, setJoinSchool] = useState(true)
  const [joined, setJoined] = useState<string | null>(null)
  const lms = info?.lmsName ?? 'your LMS'
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setError("This page opens from the Wivoza link in your school's LMS.")
      return
    }
    if (!user) return
    getLtiPending(token)
      .then(setInfo)
      .catch((e: Error) => setError(e.message))
  }, [token, user])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const result = await connectLti(token, info?.school === 'offer' && joinSchool)
      setJoined(result.joinedSchool ? (result.schoolName ?? info?.schoolName ?? null) : null)
      setDone(true)
      // Onboarding, if this is a new account, is the next stop — App sends
      // anyone who hasn't finished it there from any page.
      window.setTimeout(() => navigate('/', { replace: true }), 1200)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  async function handleSwitch() {
    await logout().catch(() => {})
    onSignedOut()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <main className="w-full max-w-md rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta-600">Wivoza · {info?.lmsName ?? 'LMS'}</p>
        {!user && !error ? (
          <>
            <h1 className="mt-2 font-heading text-2xl font-extrabold text-forest">Sign in to Wivoza</h1>
            <p className="mt-2 text-sm text-ink-soft">
              You opened Wivoza from your school's LMS. Sign in to your Wivoza account, or create one, and connect it — once. After that,
              the Wivoza link there signs you straight in.
            </p>
            <div className="mt-4">
              <AuthCard onSignedIn={onSignedIn} />
            </div>
          </>
        ) : done ? (
          <>
            <h1 className="mt-2 font-heading text-2xl font-extrabold text-forest">Connected</h1>
            <p className="mt-2 text-sm text-ink-soft">From now on, the Wivoza link in {lms} opens Wivoza signed in.
              {joined ? ` You're also part of ${joined} on Wivoza.` : ''} Taking you there now…</p>
          </>
        ) : error ? (
          <>
            <h1 className="mt-2 font-heading text-2xl font-extrabold text-forest">Couldn't connect</h1>
            <p role="alert" className="mt-2 text-sm text-ink">
              {error}
            </p>
          </>
        ) : !info ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
            <Spinner /> Checking the link from your LMS…
          </div>
        ) : (
          <>
            <h1 className="mt-2 font-heading text-2xl font-extrabold text-forest">Connect your {lms} account</h1>
            <p className="mt-2 text-sm text-ink-soft">
              You opened Wivoza from {info.schoolName}'s {lms}
              {info.nameInCanvas ? `, as ${info.nameInCanvas}` : ''}. Connect it once, and the Wivoza link in {lms} will sign you straight in
              next time.
            </p>
            <div className="mt-4 rounded-2xl border border-hairline bg-cream px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Your Wivoza account</p>
              <p className="mt-0.5 font-semibold text-forest [overflow-wrap:anywhere]">{user?.email}</p>
            </div>
            {info.school === 'offer' && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-2xl border border-hairline bg-white px-4 py-3">
                <input
                  id="join-school"
                  type="checkbox"
                  checked={joinSchool}
                  onChange={(e) => setJoinSchool(e.target.checked)}
                  className="mt-1 accent-forest"
                />
                <span className="text-sm text-ink">
                  <span className="font-semibold text-forest">Also join {info.schoolName} on Wivoza</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    You get your school's Wivoza plan and lesson plan format, and you're counted in its staff-wide numbers. Its Wivoza admins see
                    your name and when you use Wivoza — never your recordings, reports, plans or conversations.
                  </span>
                </span>
              </label>
            )}
            {info.school === 'member' && <p className="mt-3 text-xs text-ink-soft">You're already part of {info.schoolName} on Wivoza.</p>}
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-forest px-5 py-3 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`}
            >
              {connecting && <Spinner />}
              <span className="text-cream">{connecting ? 'Connecting…' : `Connect ${lms} to this account`}</span>
            </button>
            <p className="mt-3 text-center text-xs text-ink-soft">
              Not your account?{' '}
              <button type="button" onClick={handleSwitch} className={`rounded font-semibold text-forest underline underline-offset-2 ${FOCUS}`}>
                Sign in as someone else
              </button>
            </p>
            <p className="mt-4 text-xs text-ink-soft">
              Wivoza never shows anything to your students, and nothing you do in Wivoza is sent back to {lms}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
