import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import WaitingRoom from './pages/WaitingRoom';
import { Loader } from 'lucide-react';

// Protected Route Component wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-slate-500 font-medium">Authenticating session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Placeholders for Phase 7 to prevent compilation breaks
const VideoRoomPlaceholder = () => (
  <div className="max-w-md mx-auto mt-20 p-8 bg-white border border-slate-100 rounded-3xl shadow-sm text-center space-y-4">
    <h2 className="text-2xl font-bold text-slate-850">WebRTC Video Call Placeholder</h2>
    <p className="text-slate-500 text-sm">Real-time WebRTC streams will be implemented in Phase 7.</p>
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
          <Navbar />
          <div className="flex-1">
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected Clinical Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/waiting-room/:appointmentId"
                element={
                  <ProtectedRoute>
                    <WaitingRoom />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/video-room/:appointmentId"
                element={
                  <ProtectedRoute>
                    <VideoRoomPlaceholder />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all redirect to Dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
