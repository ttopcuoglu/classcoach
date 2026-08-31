import { GoogleOAuthProvider } from '@react-oauth/google'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import { getMe, type UserProfile } from './lib/api'

// Landing and Layout stay eager — Landing is the first thing every signed-out
// visitor sees (rendered directly by RequireAuth below, not just its own
// route) and Layout is needed immediately after login. Every other page is
// lazy so a new visitor's first load only ever downloads the code for the
// page they're actually looking at, not the entire authenticated app.
const Home = lazy(() => import('./pages/Home'))
const CoachChat = lazy(() => import('./pages/CoachChat'))
const Communications = lazy(() => import('./pages/Communications'))
const Profile = lazy(() => import('./pages/Profile'))
const Export = lazy(() => import('./pages/Export'))
const Shared = lazy(() => import('./pages/Shared'))
const CheatSheet = lazy(() => import('./pages/CheatSheet'))
const FirstThirtyDays = lazy(() => import('./pages/FirstThirtyDays'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AudioCoaching = lazy(() => import('./pages/AudioCoaching'))
const AudioCoachingExport = lazy(() => import('./pages/AudioCoachingExport'))
const LessonPlanning = lazy(() => import('./pages/LessonPlanning'))
const LessonPlanExport = lazy(() => import('./pages/LessonPlanExport'))
const TalkToMe = lazy(() => import('./pages/TalkToMe'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Terms = lazy(() => import('./pages/Terms'))
const Guide = lazy(() => import('./pages/Guide'))
const Faq = lazy(() => import('./pages/Faq'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <p className="text-sm text-ink-soft">Loading...</p>
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
  if (loading) return null
  if (!user) return <Landing onSignedIn={onSignedIn} />
  if (user.onboardingCompletedAt == null && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  function refreshUser() {
    setLoading(true)
    return getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refreshUser()
  }, [])

  function handleLogout() {
    setUser(null)
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="shared/:type/:token" element={<Shared />} />
            <Route path="terms" element={<Terms />} />
            <Route path="guide" element={<Guide />} />
            <Route path="faq" element={<Faq />} />
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
              path="talk-to-me"
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <TalkToMe />
                </RequireAuth>
              }
            />
            <Route
              element={
                <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                  <Layout user={user} onLogout={handleLogout} />
                </RequireAuth>
              }
            >
              <Route index element={<Home />} />
              <Route path="coach-chat" element={<CoachChat />} />
              <Route path="communications" element={<Communications />} />
              <Route path="audio-coaching" element={<AudioCoaching />} />
              <Route path="lesson-planning" element={<LessonPlanning />} />
              <Route path="profile" element={<Profile />} />
              <Route path="cheat-sheet" element={<CheatSheet />} />
              <Route path="first-30-days" element={<FirstThirtyDays />} />
              {user != null && user.role !== 'teacher' && <Route path="admin" element={<AdminDashboard />} />}
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}
