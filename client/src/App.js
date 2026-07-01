import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import AddTransaction from './pages/AddTransaction';
import History from './pages/History';
import Reports from './pages/Reports';
import Upcoming from './pages/Upcoming';
import Categories from './pages/Categories';
import Users from './pages/Users';
import Loans from './pages/Loans';
import Investments from './pages/Investments';
import Assets from './pages/Assets';
import BankReconciliation from './pages/BankReconciliation';
import Invoices from './pages/Invoices';
import InvoiceEditor from './pages/InvoiceEditor';
import Staff from './pages/Staff';
import Attendance from './pages/Attendance';
import Payroll from './pages/Payroll';
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
  '/users':           'User Management',
  '/loans':           'Loans & EMI',
  '/investments':     'Investments',
  '/assets':          'Asset Management',
  '/bank':            'Bank Reconciliation',
  '/invoices':        'Invoices & Quotations',
  '/invoices/new':    'New Document',
  '/staff':           'Staff Management',
  '/attendance':      'Attendance',
  '/payroll':         'Payroll',
};

export default function App() {
  const [token,        setToken]        = useState(() => localStorage.getItem('fm_token') || '');
  const [role,         setRole]         = useState(() => localStorage.getItem('fm_role')  || 'staff');
  const [loanAlerts,   setLoanAlerts]   = useState(0);
  const [investAlerts, setInvestAlerts] = useState(0);
  const [toast,        setToast]        = useState(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [showSplash,   setShowSplash]   = useState(() => !sessionStorage.getItem('wbm_splash_seen'));
  const location = useLocation();

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const handleLogin = (tok, _user, r) => {
    setToken(tok);
    setRole(r || 'staff');
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
    localStorage.removeItem('fm_role');
    setToken('');
    setRole('staff');
  };

  // On load: verify token + sync role; also fetch reminder alert counts
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.valid) {
          localStorage.removeItem('fm_token');
          localStorage.removeItem('fm_user');
          localStorage.removeItem('fm_role');
          setToken('');
          setRole('staff');
        } else if (data.role) {
          localStorage.setItem('fm_role', data.role);
          setRole(data.role);
        }
      })
      .catch(() => {});

    const fetchAlerts = () => {
      fetch('/api/loans/reminders').then(r => r.json())
        .then(d => setLoanAlerts((d.overdue || 0) + (d.due_soon || 0))).catch(() => {});
      fetch('/api/investments/reminders').then(r => r.json())
        .then(d => setInvestAlerts((d.due_soon || 0) + (d.maturing_soon || 0))).catch(() => {});
    };
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 300000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line

  const closeSidebar = () => setSidebarOpen(false);

  if (!token) {
    if (showSplash) {
      return (
        <>
          <Home onEnter={() => { sessionStorage.setItem('wbm_splash_seen', '1'); setShowSplash(false); }} />
          {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
      );
    }
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

        <Sidebar open={sidebarOpen} onClose={closeSidebar} onLogout={handleLogout} role={role} loanAlerts={loanAlerts} investAlerts={investAlerts} />

        <div className="app-body">
          {/* Mobile top bar */}
          <header className="mobile-topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>
              <i className="fa fa-bars" />
            </button>
            <span className="mobile-page-title">
              {PAGE_TITLES[location.pathname] || 'Wayone Business Mate'}
            </span>
            <div className="mobile-logo">
              <img src="/logo-badge.png" alt="Wayone" />
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
              <Route path="/users"           element={<Users />} />
              <Route path="/loans"           element={<Loans />} />
              <Route path="/investments"     element={<Investments />} />
              <Route path="/assets"          element={<Assets />} />
              <Route path="/bank"            element={<BankReconciliation />} />
              <Route path="/invoices"        element={<Invoices />} />
              <Route path="/invoices/new"    element={<InvoiceEditor />} />
              <Route path="/invoices/:id"    element={<InvoiceEditor />} />
              <Route path="/staff"           element={<Staff />} />
              <Route path="/attendance"      element={<Attendance />} />
              <Route path="/payroll"         element={<Payroll />} />
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
