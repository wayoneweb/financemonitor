import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const navGroups = [
  {
    label: 'Overview',
    links: [
      { to: '/dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
    ],
  },
  {
    label: 'Manage',
    links: [
      { to: '/projects',        icon: 'fa-folder-open',       label: 'Projects' },
      { to: '/add-transaction', icon: 'fa-circle-plus',       label: 'Add Transaction', badge: true },
      { to: '/history',         icon: 'fa-clock-rotate-left', label: 'History' },
      { to: '/upcoming',        icon: 'fa-calendar-days',     label: 'Upcoming' },
      { to: '/categories',      icon: 'fa-tags',              label: 'Categories' },
    ],
  },
  {
    label: 'Finance',
    links: [
      { to: '/loans',       icon: 'fa-hand-holding-dollar', label: 'Loans & EMI',  alertKey: 'loans' },
      { to: '/investments', icon: 'fa-chart-line',           label: 'Investments', alertKey: 'invest' },
      { to: '/assets',      icon: 'fa-boxes-stacked',        label: 'Assets' },
      { to: '/bank',        icon: 'fa-building-columns',     label: 'Bank Reconciliation' },
    ],
  },
  {
    label: 'Documents',
    links: [
      { to: '/invoices', icon: 'fa-file-invoice-dollar', label: 'Invoices & Quotations' },
    ],
  },
  {
    label: 'HR & Payroll',
    links: [
      { to: '/staff',      icon: 'fa-id-card',    label: 'Staff Management' },
      { to: '/attendance', icon: 'fa-calendar-check', label: 'Attendance' },
      { to: '/payroll',    icon: 'fa-money-check-dollar', label: 'Payroll' },
    ],
  },
  {
    label: 'Accounting',
    links: [
      { to: '/accounting/chart-of-accounts', icon: 'fa-sitemap',       label: 'Chart of Accounts' },
      { to: '/accounting/vouchers',          icon: 'fa-file-invoice', label: 'Vouchers' },
      { to: '/accounting/reports',           icon: 'fa-chart-pie',   label: 'Financial Reports' },
    ],
  },
  {
    label: 'Reports',
    links: [
      { to: '/reports', icon: 'fa-file-export', label: 'Export / Import' },
    ],
  },
];

const EMPTY_PWD = { current: '', newPwd: '', confirm: '' };

const ROLE_LABELS = { admin: 'Administrator', staff: 'Staff', accountant: 'Accountant' };

export default function Sidebar({ open, onClose, onLogout, role, loanAlerts, investAlerts }) {
  const alertMap = { loans: loanAlerts || 0, invest: investAlerts || 0 };
  const [pwdModal, setPwdModal] = useState(false);
  const [form,     setForm]     = useState(EMPTY_PWD);
  const [show,     setShow]     = useState({ current: false, newPwd: false, confirm: false });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const openPwd = () => { setForm(EMPTY_PWD); setError(''); setSuccess(''); setPwdModal(true); };
  const closePwd = () => { setPwdModal(false); setError(''); setSuccess(''); };

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const toggleShow = (field) => setShow((s) => ({ ...s, [field]: !s[field] }));

  const submitChange = async () => {
    if (!form.current)      return setError('Please enter your current password.');
    if (!form.newPwd)       return setError('Please enter a new password.');
    if (form.newPwd.length < 6) return setError('New password must be at least 6 characters.');
    if (form.newPwd !== form.confirm) return setError('New passwords do not match.');
    if (form.newPwd === form.current) return setError('New password must be different from current password.');

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('fm_token') || ''}`,
        },
        body: JSON.stringify({ current_password: form.current, new_password: form.newPwd }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Password changed! Signing you out…');
        setTimeout(() => {
          closePwd();
          onLogout();
        }, 1800);
      } else {
        setError(data.message || 'Failed to change password.');
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <aside className={'sidebar' + (open ? ' sidebar-open' : '')}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon">
            <img src="/logo-badge.png" alt="Wayone" className="brand-logo-img" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="brand-name">Wayone Business Mate</div>
            <div className="brand-sub">Business Management</div>
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <i className="fa fa-xmark" />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <React.Fragment key={group.label}>
              <div className="nav-section-label">{group.label}</div>
              {group.links.map(({ to, icon, label, badge, alertKey }) => {
                const alertCount = alertKey ? alertMap[alertKey] : 0;
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                  >
                    <i className={`fa ${icon}`} />
                    <span>{label}</span>
                    {badge && <span className="nav-badge"><i className="fa fa-plus" /></span>}
                    {alertCount > 0 && (
                      <span className="nav-alert-badge">{alertCount > 9 ? '9+' : alertCount}</span>
                    )}
                  </NavLink>
                );
              })}
            </React.Fragment>
          ))}
          {role === 'admin' && (
            <>
              <div className="nav-section-label">Administration</div>
              <NavLink
                to="/users"
                onClick={onClose}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                <i className="fa fa-users-gear" />
                <span>User Management</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="footer-user">
            <div className="footer-avatar"><i className="fa fa-user" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="footer-name">{localStorage.getItem('fm_user') || 'admin'}</div>
              <div className="footer-role">{ROLE_LABELS[role] || 'User'}</div>
            </div>
            <button className="footer-icon-btn" onClick={openPwd} title="Change password">
              <i className="fa fa-key" />
            </button>
            <button className="logout-btn" onClick={onLogout} title="Sign out">
              <i className="fa fa-right-from-bracket" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Change Password Modal ─────────────────────────────── */}
      {pwdModal && (
        <div className="pwd-modal-overlay" onClick={(e) => e.target === e.currentTarget && closePwd()}>
          <div className="pwd-modal-box">
            {/* Header */}
            <div className="pwd-modal-header">
              <div className="pwd-modal-icon">
                <i className="fa fa-key" />
              </div>
              <div>
                <div className="pwd-modal-title">Change Password</div>
                <div className="pwd-modal-sub">Update your admin password</div>
              </div>
              <button className="pwd-modal-close" onClick={closePwd}>
                <i className="fa fa-xmark" />
              </button>
            </div>

            {/* Body */}
            <div className="pwd-modal-body">
              {/* Current password */}
              <div className="pwd-field">
                <label className="pwd-label">Current Password</label>
                <div className="pwd-input-wrap">
                  <i className="fa fa-lock pwd-input-icon" />
                  <input
                    name="current"
                    type={show.current ? 'text' : 'password'}
                    className="pwd-input"
                    value={form.current}
                    onChange={handleChange}
                    placeholder="Enter current password"
                    autoFocus
                  />
                  <button type="button" className="pwd-eye" onClick={() => toggleShow('current')}>
                    <i className={`fa ${show.current ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="pwd-field">
                <label className="pwd-label">New Password</label>
                <div className="pwd-input-wrap">
                  <i className="fa fa-lock-open pwd-input-icon" />
                  <input
                    name="newPwd"
                    type={show.newPwd ? 'text' : 'password'}
                    className="pwd-input"
                    value={form.newPwd}
                    onChange={handleChange}
                    placeholder="Minimum 6 characters"
                  />
                  <button type="button" className="pwd-eye" onClick={() => toggleShow('newPwd')}>
                    <i className={`fa ${show.newPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
                {/* Strength bar */}
                {form.newPwd && (
                  <div className="pwd-strength-bar">
                    <div className={`pwd-strength-fill str-${
                      form.newPwd.length < 6 ? 'weak' :
                      form.newPwd.length < 10 ? 'medium' : 'strong'
                    }`} />
                    <span className="pwd-strength-label">
                      {form.newPwd.length < 6 ? 'Weak' : form.newPwd.length < 10 ? 'Medium' : 'Strong'}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div className="pwd-field">
                <label className="pwd-label">Confirm New Password</label>
                <div className="pwd-input-wrap">
                  <i className={`fa ${form.confirm && form.confirm === form.newPwd ? 'fa-circle-check' : 'fa-lock-open'} pwd-input-icon ${form.confirm && form.confirm === form.newPwd ? 'icon-match' : ''}`} />
                  <input
                    name="confirm"
                    type={show.confirm ? 'text' : 'password'}
                    className={`pwd-input ${form.confirm && form.confirm !== form.newPwd ? 'pwd-input-err' : ''} ${form.confirm && form.confirm === form.newPwd ? 'pwd-input-ok' : ''}`}
                    value={form.confirm}
                    onChange={handleChange}
                    placeholder="Re-enter new password"
                  />
                  <button type="button" className="pwd-eye" onClick={() => toggleShow('confirm')}>
                    <i className={`fa ${show.confirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="pwd-error">
                  <i className="fa fa-circle-exclamation" /> {error}
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="pwd-success">
                  <i className="fa fa-circle-check" /> {success}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pwd-modal-footer">
              <button className="btn btn-ghost" onClick={closePwd} disabled={saving}>Cancel</button>
              <button className="pwd-submit-btn" onClick={submitChange} disabled={saving || !!success}>
                {saving
                  ? <><i className="fa fa-spinner fa-spin" /> Changing…</>
                  : <><i className="fa fa-check" /> Change Password</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
