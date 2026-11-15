import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const link = ({ isActive }) =>
  `px-3 py-1.5 rounded no-underline ${isActive ? 'bg-peri text-paper' : 'text-paper hover:bg-peri/60'}`;

export default function Layout({ children }) {
  const { profile, signOut } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="bg-navy text-paper">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="font-semibold mr-4">Exam Behavior Monitoring</span>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" end className={link}>Dashboard</NavLink>
            <NavLink to="/sessions" className={link}>Monitoring Sessions</NavLink>
            <NavLink to="/activity" className={link}>Activity Logs</NavLink>
          </nav>
          <span className="ml-auto text-xs">{profile.full_name}</span>
          <button className="btn-alt" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
