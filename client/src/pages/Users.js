import React, { useState, useEffect, useContext } from 'react';
import { ToastContext } from '../App';
import { usersApi } from '../api';
import './Users.css';

const ROLES       = ['admin', 'staff', 'accountant'];
const ROLE_COLORS = { admin: 'role-admin', staff: 'role-staff', accountant: 'role-accountant' };
const ROLE_ICONS  = { admin: 'fa-crown', staff: 'fa-user', accountant: 'fa-calculator' };
const EMPTY_FORM  = { username: '', password: '', role: 'staff', is_active: true };

export default function Users() {
  const showToast = useContext(ToastContext);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [showPwd,  setShowPwd]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error,    setError]    = useState('');

  const myUsername = localStorage.getItem('fm_user') || '';

  const load = async () => {
    setLoading(true);
    try {
      const data = await usersApi.list();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setShowPwd(false);
    setError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (user) => {
    setForm({ username: user.username, password: '', role: user.role, is_active: !!user.is_active });
    setShowPwd(false);
    setError('');
    setModal({ mode: 'edit', user });
  };

  const closeModal = () => { setModal(null); setError(''); };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const handleSave = async () => {
    if (!form.username.trim()) return setError('Username is required.');
    if (modal.mode === 'create' && !form.password) return setError('Password is required.');
    if (form.password && form.password.length < 6) return setError('Password must be at least 6 characters.');

    setSaving(true);
    setError('');
    try {
      if (modal.mode === 'create') {
        await usersApi.create({ username: form.username.trim(), password: form.password, role: form.role });
        showToast('User created successfully', 'success');
      } else {
        const payload = { username: form.username.trim(), role: form.role, is_active: form.is_active };
        if (form.password) payload.password = form.password;
        await usersApi.update(modal.user.id, payload);
        showToast('User updated successfully', 'success');
      }
      closeModal();
      load();
    } catch (err) {
      setError(err.error || err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    setDeleting(user.id);
    try {
      await usersApi.remove(user.id);
      showToast('User deleted', 'success');
      load();
    } catch (err) {
      showToast(err.error || 'Failed to delete user', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const stats = {
    total:      users.length,
    active:     users.filter((u) => u.is_active).length,
    admins:     users.filter((u) => u.role === 'admin').length,
    others:     users.filter((u) => u.role !== 'admin').length,
  };

  const fmtDate = (s) =>
    s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="users-page">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="users-header">
        <div className="users-header-inner">
          <div className="users-header-left">
            <div className="users-header-icon"><i className="fa fa-users-gear" /></div>
            <div>
              <div className="users-header-title">User Management</div>
              <div className="users-header-sub">Create, edit and manage system users &amp; roles</div>
            </div>
          </div>
          <button className="users-btn-create" onClick={openCreate}>
            <i className="fa fa-user-plus" /> Add User
          </button>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────────── */}
      <div className="users-summary-grid">
        <div className="ustat total-stat">
          <div className="ustat-icon"><i className="fa fa-users" /></div>
          <div className="ustat-info">
            <div className="ustat-label">Total Users</div>
            <div className="ustat-value">{stats.total}</div>
          </div>
        </div>
        <div className="ustat active-stat">
          <div className="ustat-icon"><i className="fa fa-circle-check" /></div>
          <div className="ustat-info">
            <div className="ustat-label">Active</div>
            <div className="ustat-value">{stats.active}</div>
          </div>
        </div>
        <div className="ustat admin-stat">
          <div className="ustat-icon"><i className="fa fa-crown" /></div>
          <div className="ustat-info">
            <div className="ustat-label">Admins</div>
            <div className="ustat-value">{stats.admins}</div>
          </div>
        </div>
        <div className="ustat other-stat">
          <div className="ustat-icon"><i className="fa fa-id-badge" /></div>
          <div className="ustat-info">
            <div className="ustat-label">Staff / Accountants</div>
            <div className="ustat-value">{stats.others}</div>
          </div>
        </div>
      </div>

      {/* ── Table Card ───────────────────────────────────────── */}
      <div className="users-table-card">
        <div className="users-table-header">
          <div className="users-table-title">
            <div className="users-table-title-icon"><i className="fa fa-list" /></div>
            All Users
          </div>
          <span className="users-count-badge">{users.length} total</span>
        </div>

        {loading ? (
          <div className="users-state-box">
            <i className="fa fa-spinner fa-spin users-state-icon" />
            <div>Loading users…</div>
          </div>
        ) : users.length === 0 ? (
          <div className="users-state-box">
            <i className="fa fa-users-slash users-state-icon" style={{ color: '#94a3b8' }} />
            <div>No users found</div>
            <button className="users-btn-create" onClick={openCreate} style={{ marginTop: 14 }}>
              <i className="fa fa-user-plus" /> Add First User
            </button>
          </div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} className={!user.is_active ? 'row-inactive' : ''}>
                    <td className="col-num">{i + 1}</td>
                    <td>
                      <div className="user-name-cell">
                        <div className={`user-avatar-sm ${ROLE_COLORS[user.role]}`}>
                          <i className={`fa ${ROLE_ICONS[user.role]}`} />
                        </div>
                        <div>
                          <div className="user-username">{user.username}</div>
                          {user.username === myUsername && (
                            <span className="you-tag">You</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${ROLE_COLORS[user.role]}`}>
                        <i className={`fa ${ROLE_ICONS[user.role]}`} />
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${user.is_active ? 'status-active' : 'status-inactive'}`}>
                        <i className={`fa ${user.is_active ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="col-date">{fmtDate(user.created_at)}</td>
                    <td>
                      <div className="user-actions">
                        <button
                          className="user-action-btn edit-btn"
                          onClick={() => openEdit(user)}
                          title="Edit user"
                        >
                          <i className="fa fa-pen" /> Edit
                        </button>
                        <button
                          className="user-action-btn delete-btn"
                          onClick={() => handleDelete(user)}
                          disabled={!!deleting}
                          title="Delete user"
                        >
                          {deleting === user.id
                            ? <><i className="fa fa-spinner fa-spin" /> …</>
                            : <><i className="fa fa-trash" /> Delete</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ───────────────────────────────── */}
      {modal && (
        <div
          className="users-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="users-modal-box">
            {/* Header */}
            <div className="users-modal-header">
              <div className="users-modal-icon">
                <i className={`fa ${modal.mode === 'create' ? 'fa-user-plus' : 'fa-user-pen'}`} />
              </div>
              <div>
                <div className="users-modal-title">
                  {modal.mode === 'create' ? 'Add New User' : 'Edit User'}
                </div>
                <div className="users-modal-sub">
                  {modal.mode === 'create'
                    ? 'Create a new system user account'
                    : `Editing: ${modal.user.username}`}
                </div>
              </div>
              <button className="users-modal-close" onClick={closeModal}>
                <i className="fa fa-xmark" />
              </button>
            </div>

            {/* Body */}
            <div className="users-modal-body">
              {/* Username */}
              <div className="umod-field">
                <label className="umod-label">Username</label>
                <div className="umod-input-wrap">
                  <i className="fa fa-user umod-icon" />
                  <input
                    type="text"
                    name="username"
                    className="umod-input"
                    value={form.username}
                    onChange={handleFormChange}
                    placeholder="Enter username"
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="umod-field">
                <label className="umod-label">
                  {modal.mode === 'edit'
                    ? 'New Password (leave blank to keep current)'
                    : 'Password'}
                </label>
                <div className="umod-input-wrap">
                  <i className="fa fa-lock umod-icon" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    name="password"
                    className="umod-input"
                    value={form.password}
                    onChange={handleFormChange}
                    placeholder={
                      modal.mode === 'edit' ? 'Leave blank to keep current' : 'Min. 6 characters'
                    }
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="umod-eye"
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    <i className={`fa ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>

              {/* Role */}
              <div className="umod-field">
                <label className="umod-label">Role</label>
                <div className="umod-role-grid">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`umod-role-btn ${r}${form.role === r ? ' selected' : ''}`}
                      onClick={() => { setForm((f) => ({ ...f, role: r })); setError(''); }}
                    >
                      <i className={`fa ${ROLE_ICONS[r]}`} />
                      <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active toggle (edit only) */}
              {modal.mode === 'edit' && (
                <div className="umod-field">
                  <label className="umod-label">Account Status</label>
                  <label className="umod-toggle-wrap">
                    <input
                      type="checkbox"
                      name="is_active"
                      className="umod-toggle-input"
                      checked={form.is_active}
                      onChange={handleFormChange}
                    />
                    <span className="umod-toggle-track">
                      <span className="umod-toggle-thumb" />
                    </span>
                    <span className={`umod-toggle-label ${form.is_active ? 'label-active' : 'label-inactive'}`}>
                      {form.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </div>
              )}

              {error && (
                <div className="umod-error">
                  <i className="fa fa-circle-exclamation" /> {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="users-modal-footer">
              <button className="umod-btn-cancel" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button className="umod-btn-save" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><i className="fa fa-spinner fa-spin" /> Saving…</>
                  : <><i className="fa fa-check" /> {modal.mode === 'create' ? 'Create User' : 'Save Changes'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
