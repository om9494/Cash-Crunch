import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import Dashboard from './pages/Dashboard.jsx';

/**
 * App — top-level router.
 * / → CashCrunch marketing landing page
 * /app → existing merchant dashboard
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app/*" element={<Dashboard />} />
    </Routes>
  );
}
