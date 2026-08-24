import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import TryItOut from './pages/TryItOut'
import AskExpert from './pages/AskExpert'
import Profile from './pages/Profile'
import Export from './pages/Export'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="try-it-out" element={<TryItOut />} />
          <Route path="ask-an-expert" element={<AskExpert />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="export" element={<Export />} />
      </Routes>
    </BrowserRouter>
  )
}
