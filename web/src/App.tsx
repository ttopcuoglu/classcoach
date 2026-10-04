import { GoogleOAuthProvider } from '@react-oauth/google'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import { getMe, type UserProfile } from './lib/api'
import { applyPageMeta } from './lib/pageMeta'

// Landing and Layout stay eager — Landing is the first thing every signed-out
// visitor sees (rendered directly by RequireAuth below, not just its own
// route) and Layout is needed immediately after login. Every other page is
// lazy so a new visitor's first load only ever downloads the code for the
// page they're actually looking at, not the entire authenticated app.
const Home = lazy(() => import('./pages/Home'))
const Communications = lazy(() => import('./pages/Communications'))
const Profile = lazy(() => import('./pages/Profile'))
const Export = lazy(() => import('./pages/Export'))
const Shared = lazy(() => import('./pages/Shared'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
// The four surfaces. Practice is TryItOut, which stopped being a tab inside
// Ask & Practice and became a page of its own.
const LookItOver = lazy(() => import('./pages/LookItOver'))
const Practice = lazy(() => import('./pages/TryItOut'))
const MyWork = lazy(() => import('./pages/MyWork'))
const AudioCoaching = lazy(() => import('./pages/AudioCoaching'))
const AudioCoachingExport = lazy(() => import('./pages/AudioCoachingExport'))
const LessonPlanning = lazy(() => import('./pages/LessonPlanning'))
const AssignmentCoach = lazy(() => import('./pages/AssignmentCoach'))
const AssignmentCoachExport = lazy(() => import('./pages/AssignmentCoachExport'))
const LessonPlanExport = lazy(() => import('./pages/LessonPlanExport'))
const TalkItThroughExport = lazy(() => import('./pages/TalkItThroughExport'))
const AskPracticeExport = lazy(() => import('./pages/AskPracticeExport'))
const CommunicationExport = lazy(() => import('./pages/CommunicationExport'))
const AdminPilotReport = lazy(() => import('./pages/AdminPilotReport'))
const TalkToMe = lazy(() => import('./pages/TalkToMe'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Terms = lazy(() => import('./pages/Terms'))
const Guide = lazy(() => import('./pages/Guide'))
const ForSchools = lazy(() => import('./pages/ForSchools'))
const GuideTalkItThrough = lazy(() => import('./pages/GuideTalkItThrough'))
const GuidePractice = lazy(() => import('./pages/GuidePractice'))
const GuideLookItOver = lazy(() => import('./pages/GuideLookItOver'))
const GuideLessonDebrief = lazy(() => import('./pages/GuideLessonDebrief'))
const Faq = lazy(() => import('./pages/Faq'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))

function RouteFallback() {
  // The backend can take up to ~30s to respond on its very first request
  // after a period of inactivity (the Render instance spinning back up) —
  // a bare, unchanging "Loading..." during that wait reads as broken and
  // risks a teacher giving up. Swap to a more specific, reassuring message
  // once it's clearly not just a normal fast load.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-terracotta border-t-transparent" aria-hidden="true" />
      <p className="max-w-xs text-center text-sm text-ink-soft">
        {slow ? "Still on it — this can take up to 30 seconds if the server's been idle." : 'Loading...'}
      </p>
    </div>
  )
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

function RequireAuth({
  user,
  loading,
  onSignedIn,
  children,
}: {
  user: UserProfile | null
  loading: boolean
  onSignedIn: () => void
  children: React.ReactNode
}) {
  const location = useLocation()
  if (loading) return <RouteFallback />
  if (!user) return <Landing onSignedIn={onSignedIn} />
  if (user.onboardingCompletedAt == null && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

/// A redirect that carries the query string with it.
///
/// Every old route that moved had meaningful params — `?open=` for a past
/// item, `?topic=`, `?followUp=` for a check-in link Telegram already sent.
/// Dropping them would turn a deep link into a landing page, which is a
/// subtler failure than a 404 and harder to notice.
export function KeepQuery({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

/// A retired tool's route: its original page when opening a specific past
/// item, and a redirect to the surface that replaced it otherwise.
///
/// The alternative was redirecting unconditionally, which would have made
/// every lesson plan, assignment review and message a teacher already has
/// unopenable — the consolidation reorganising the navigation is not a reason
/// for their own work to stop working.
export function LegacyOrRedirect({ to, page }: { to: string; page: React.ReactNode }) {
  const [params] = useSearchParams()
  if (params.get('open')) return <>{page}</>
  return <Navigate to={to} replace />
}

/// Ask & Practice split in two, so where this lands depends on which half the
/// teacher was in. Ask's own history lives in Talk It Through, which can open
/// those rows by id, so nothing needs the old page.
export function RedirectCoachChat() {
  const [params] = useSearchParams()
  const open = params.get('open')
  if (params.get('tab') === 'practice') {
    return <Navigate to={open ? `/practice?open=${open}` : '/practice'} replace />
  }
  const area = params.get('area')
  const query = new URLSearchParams()
  if (open) query.set('open', open)
  // The old `area` param is the same taxonomy, under its new name.
  if (area) query.set('topic', area)
  const suffix = query.toString()
  return <Navigate to={`/talk${suffix ? `?${suffix}` : ''}`} replace />
}

// Keeps the document title, description and canonical link in step with the
// current route (see lib/pageMeta.ts).
function PageMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    applyPageMeta(pathname)
  }, [pathname])
  return null
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  function refreshUser(retriesLeft = 0): Promise<void> {
    setLoading(true)
    return getMe()
      .then((profile) => {
        setUser(profile)
        setLoading(false)
      })
      .catch(async () => {
        // Right after bouncing back from an external redirect (e.g. Stripe
        // Checkout), some browsers briefly withhold the session cookie from
        // this first cross-origin request — retry a couple of times before
        // concluding the user is actually signed out.
        if (retriesLeft > 0) {
          await new Promise((resolve) => setTimeout(resolve, 700))
          return refreshUser(retriesLeft - 1)
        }
        setUser(null)
        setLoading(false)
      })
  }

  useEffect(() => {
    const cameFromCheckout = new URLSearchParams(window.location.search).get('upgraded') === 'true'
    refreshUser(cameFromCheckout ? 3 : 0)
  }, [])

  function handleLogout() {
    setUser(null)
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <PageMeta />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="shared/:type/:token" element={<Shared />} />
            <Route path="terms" element={<Terms />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="guide" element={<Guide />} />
            <Route path="guide/talk-it-through" element={<GuideTalkItThrough />} />
            <Route path="guide/lesson-debrief" element={<GuideLessonDebrief />} />
            {/* One guide per surface. */}
            <Route path="guide/practice" element={<GuidePractice />} />
            <Route path="guide/look-it-over" element={<GuideLookItOver />} />

            {/* The retired tools' guides. Ask & Practice split in two;
                Lesson Planning, Assignment Coach and Communication Coach were
                one act on four file types and are now one guide. These URLs
                are indexed and linked from inside the app, so they redirect
                rather than 404. */}
            <Route path="guide/ask-practice" element={<Navigate to="/guide/talk-it-through" replace />} />
            <Route path="guide/cheat-sheet" element={<Navigate to="/guide" replace />} />
            <Route path="guide/lesson-planning" element={<Navigate to="/guide/look-it-over" replace />} />
            <Route path="guide/assignment-coach" element={<Navigate to="/guide/look-it-over" replace />} />
            <Route path="guide/communication-coach" element={<Navigate to="/guide/look-it-over" replace />} />
            <Route path="faq" element={<Faq />} />
            <Route path="for-schools" element={<ForSchools />} />
            <Route
              path="onboarding"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <Onboarding onDone={refreshUser} />
                </RequireAuth>
              }
            />
            <Route
              path="export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <Export />
                </RequireAuth>
              }
            />
            <Route
              path="admin/pilot-report"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  {user != null && user.role !== 'teacher' ? <AdminPilotReport /> : <Navigate to="/" replace />}
                </RequireAuth>
              }
            />
            <Route
              path="audio-coaching/:id/export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <AudioCoachingExport />
                </RequireAuth>
              }
            />
            <Route
              path="lesson-planning/:id/export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <LessonPlanExport />
                </RequireAuth>
              }
            />
            <Route
              path="talk-to-me/:id/export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <TalkItThroughExport />
                </RequireAuth>
              }
            />
            <Route
              path="ask-practice/:kind/:id/export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <AskPracticeExport />
                </RequireAuth>
              }
            />
            <Route
              path="communications/:kind/:id/export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <CommunicationExport />
                </RequireAuth>
              }
            />
            <Route
              path="assignment-coach/:id/export"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <AssignmentCoachExport />
                </RequireAuth>
              }
            />
            {/* Outside the Layout: a voice conversation takes the whole
                screen, which is why this was never a Layout child. */}
            <Route
              path="talk"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <TalkToMe />
                </RequireAuth>
              }
            />
            {/* The live URL until now, and the one Telegram's check-in links
                point at. Query preserved so ?open=, ?topic= and ?followUp=
                all survive the move. */}
            <Route path="talk-to-me" element={<KeepQuery to="/talk" />} />
            <Route
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <Layout user={user} onLogout={handleLogout} />
                </RequireAuth>
              }
            >
              <Route index element={<Home />} />

              {/* The four surfaces, plus one history and the profile. */}
              <Route path="practice" element={<Practice />} />
              <Route path="look-it-over" element={<LookItOver />} />
              {/* A result has a URL of its own, so it can be bookmarked,
                  linked from My Work, and returned to after a reload. The
                  input state keeps ?draft= for the same reason: a review that
                  exists but has not been run is still somewhere a teacher can
                  come back to. */}
              <Route path="look-it-over/:reviewId" element={<LookItOver />} />
              <Route path="debrief" element={<AudioCoaching />} />
              <Route path="work" element={<MyWork />} />
              <Route path="profile" element={<Profile />} />

              {/* The nine tools' routes, kept as redirects.
                  These are in teachers' browser history and bookmarks, and in
                  links inside exports and emails already sent. A 404 on any
                  of them is the consolidation losing a teacher rather than
                  reorganising the app for them.
                  Three keep rendering their original page when an `?open=`
                  id is present: a teacher's own past work has to stay
                  openable, and those pages are where it was written. */}
              <Route path="coach-chat" element={<RedirectCoachChat />} />
              <Route path="communications" element={<LegacyOrRedirect to="/talk" page={<Communications />} />} />
              <Route
                path="lesson-planning"
                element={<LegacyOrRedirect to="/look-it-over" page={<LessonPlanning />} />}
              />
              <Route
                path="assignment-coach"
                element={<LegacyOrRedirect to="/look-it-over" page={<AssignmentCoach />} />}
              />
              <Route path="audio-coaching" element={<KeepQuery to="/debrief" />} />

              {/* Deleted outright. A teacher part-way through First 30 Days
                  lands on Talk It Through with no error and nothing referring
                  to a programme that no longer exists — which is the whole
                  requirement for them. */}
              <Route path="cheat-sheet" element={<Navigate to="/talk" replace />} />
              <Route path="first-30-days" element={<Navigate to="/talk" replace />} />
              {/* Always registered, so /admin never falls through to a blank page
                  (e.g. right after logging out on it) — a teacher is sent home. */}
              <Route
                path="admin"
                element={user != null && user.role !== 'teacher' ? <AdminDashboard /> : <Navigate to="/" replace />}
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}
