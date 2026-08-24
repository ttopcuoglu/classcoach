import { GoogleOAuthProvider } from '@react-oauth/google'
import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import TryItOut from './pages/TryItOut'
import AskExpert from './pages/AskExpert'
import Profile from './pages/Profile'
import Export from './pages/Export'
import Shared from './pages/Shared'
import CheatSheet from './pages/CheatSheet'
import FirstThirtyDays from './pages/FirstThirtyDays'
import AdminDashboard from './pages/AdminDashboard'
import Login from './pages/Login'
import { getMe, type UserProfile } from './lib/api'

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
  if (loading) return null
  if (!user) return <Login onSignedIn={onSignedIn} />
  return <>{children}</>
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  function refreshUser() {
    setLoading(true)
    getMe()
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
        <Routes>
          <Route path="shared/:type/:token" element={<Shared />} />
          <Route
            path="export"
            element={
              <RequireAuth user={user} loading={loading} onSignedIn={refreshUser}>
                <Export />
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
            <Route path="try-it-out" element={<TryItOut />} />
            <Route path="ask-an-expert" element={<AskExpert />} />
            <Route path="profile" element={<Profile />} />
            <Route path="cheat-sheet" element={<CheatSheet />} />
            <Route path="first-30-days" element={<FirstThirtyDays />} />
            {user?.role === 'admin' && <Route path="admin" element={<AdminDashboard />} />}
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}
