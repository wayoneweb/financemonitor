import React, { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import AddTransaction from './pages/AddTransaction';
import History from './pages/History';
import Reports from './pages/Reports';
import Upcoming from './pages/Upcoming';
import Categories from './pages/Categories';
import './App.css';

export const ToastContext = React.createContext(null);

const PAGE_TITLES = {
  '/dashboard':       'Dashboard',
  '/projects':        'Projects',
  '/add-transaction': 'Add Transaction',
  '/history':         'History',
  '/upcoming':        'Upcoming',
  '/categories':      'Categories',
  '/reports':         'Reports',
};

export default function App() {
  const [token,       setToken]       = useState(() => localStorage.getItem('fm_token') || '');
  const [toast,       setToast]       = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const handleLogin = (tok) => {
    setToken(tok);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
    localStorage.removeItem('fm_token');
    localStorage.removeItem('fm_user');
    setToken('');
  };

  const closeSidebar = () => setSidebarOpen(false);

  if (!token) {
    return (
      <>
        <Login onLogin={handleLogin} />
        {toast && (
          <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </>
    );
  }

  return (
    <ToastContext.Provider value={showToast}>
      <div className="app-layout">
        {/* Mobile overlay */}
        {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

        <Sidebar open={sidebarOpen} onClose={closeSidebar} onLogout={handleLogout} />

        <div className="app-body">
          {/* Mobile top bar */}
          <header className="mobile-topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>
              <i className="fa fa-bars" />
            </button>
            <span className="mobile-page-title">
              {PAGE_TITLES[location.pathname] || 'Finance Monitor'}
            </span>
            <div className="mobile-logo">
              <i className="fa fa-coins" />
            </div>
          </header>

          <main className="app-content">
            <Routes>
              <Route path="/"                element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"       element={<Dashboard />} />
              <Route path="/projects"        element={<Projects />} />
              <Route path="/add-transaction" element={<AddTransaction />} />
              <Route path="/history"         element={<History />} />
              <Route path="/upcoming"        element={<Upcoming />} />
              <Route path="/categories"     element={<Categories />} />
              <Route path="/reports"         element={<Reports />} />
            </Routes>
          </main>
        </div>
      </div>

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </ToastContext.Provider>
  );
}
