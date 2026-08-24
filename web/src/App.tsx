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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="try-it-out" element={<TryItOut />} />
          <Route path="ask-an-expert" element={<AskExpert />} />
          <Route path="profile" element={<Profile />} />
          <Route path="cheat-sheet" element={<CheatSheet />} />
          <Route path="first-30-days" element={<FirstThirtyDays />} />
        </Route>
        <Route path="export" element={<Export />} />
        <Route path="shared/:type/:token" element={<Shared />} />
      </Routes>
    </BrowserRouter>
  )
}
