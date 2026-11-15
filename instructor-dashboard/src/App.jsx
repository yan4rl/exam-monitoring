import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Sessions from './pages/Sessions.jsx';
import SessionDetail from './pages/SessionDetail.jsx';
import StudentRecord from './pages/StudentRecord.jsx';
import ActivityLogs from './pages/ActivityLogs.jsx';

export default function App() {
  const { session, profile, signOut } = useAuth();
  if (session === undefined || (session && profile === undefined)) return <p className="p-6">Loading...</p>;
  if (!session) return <Login />;
  if (!profile || profile.role !== 'instructor') {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1>Instructor access required</h1>
        <p className="mb-4">This dashboard is for instructors. Students use the browser extension instead. If you are an instructor, ask the administrator to add your email to the instructor allowlist, then create the account again with that email.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/sessions/:id/students/:studentId" element={<StudentRecord />} />
        <Route path="/activity" element={<ActivityLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
