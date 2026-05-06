import React, { useState, useRef } from 'react';
import './Login.css';

export default function Login({ onLogin }) {
  const [form, setForm]       = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const formRef = useRef(null);

  const handle = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const shake = () => {
    formRef.current?.classList.add('shake');
    setTimeout(() => formRef.current?.classList.remove('shake'), 500);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Please enter both username and password.');
      shake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username.trim(), password: form.password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('fm_token', data.token);
        localStorage.setItem('fm_user', data.username);
        onLogin(data.token, data.username);
      } else {
        setError(data.message || 'Invalid credentials.');
        shake();
      }
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
      shake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left panel – branding */}
      <div className="login-panel-left">
        <div className="lp-inner">
          <div className="lp-logo">
            <i className="fa fa-coins" />
          </div>
          <h1 className="lp-title">Finance<br />Monitor</h1>
          <p className="lp-sub">Project-level income &amp; expense tracking<br />with full audit trail and reports.</p>

          <ul className="lp-features">
            <li><i className="fa fa-circle-check" /> Real-time dashboard &amp; KPI cards</li>
            <li><i className="fa fa-circle-check" /> Per-project income &amp; expense tracking</li>
            <li><i className="fa fa-circle-check" /> Bill &amp; receipt proof uploads</li>
            <li><i className="fa fa-circle-check" /> Export to Excel &amp; PDF</li>
            <li><i className="fa fa-circle-check" /> Import from Excel with preview</li>
          </ul>
        </div>

        <div className="lp-orbs">
          <div className="orb orb1" />
          <div className="orb orb2" />
          <div className="orb orb3" />
        </div>
      </div>

      {/* Right panel – login form */}
      <div className="login-panel-right">
        <div className="login-form-wrap" ref={formRef}>
          <div className="login-form-header">
            <div className="login-mobile-logo">
              <i className="fa fa-coins" />
            </div>
            <h2 className="login-heading">Welcome back</h2>
            <p className="login-hint">Sign in to your Finance Monitor account</p>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="lf-group">
              <label className="lf-label">
                <i className="fa fa-user" /> Username
              </label>
              <input
                type="text"
                name="username"
                className={'lf-input' + (error ? ' lf-input-err' : '')}
                placeholder="Enter your username"
                value={form.username}
                onChange={handle}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="lf-group">
              <label className="lf-label">
                <i className="fa fa-lock" /> Password
              </label>
              <div className="lf-pwd-wrap">
                <input
                  type={showPwd ? 'text' : 'password'}
                  name="password"
                  className={'lf-input' + (error ? ' lf-input-err' : '')}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handle}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lf-eye"
                  onClick={() => setShowPwd((v) => !v)}
                  tabIndex={-1}
                >
                  <i className={`fa ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            {error && (
              <div className="lf-error">
                <i className="fa fa-circle-exclamation" /> {error}
              </div>
            )}

            <button type="submit" className="lf-btn" disabled={loading}>
              {loading
                ? <><i className="fa fa-spinner fa-spin" /> Signing in…</>
                : <><i className="fa fa-right-to-bracket" /> Sign In</>}
            </button>
          </form>

          <div className="login-footer-note">
            <i className="fa fa-shield-halved" /> Secured — access restricted to authorised users
          </div>
        </div>
      </div>
    </div>
  );
}
