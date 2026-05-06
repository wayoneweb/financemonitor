import React, { useState, useEffect, useContext } from 'react';
import { projectsApi } from '../api';
import Modal from '../components/Modal';
import { ToastContext } from '../App';

const STATUSES = ['active', 'completed', 'on-hold', 'cancelled'];
const EMPTY_FORM = { name: '', description: '', client: '', start_date: '', end_date: '', budget: '', currency: 'INR', status: 'active' };

function ProjectForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handle = (e) => set(e.target.name, e.target.value);

  return (
    <div className="form-grid">
      <div className="form-group span2">
        <label className="form-label">Project Name <span className="req">*</span></label>
        <input name="name" className="form-control" value={form.name} onChange={handle} placeholder="e.g. Website Redesign" />
      </div>
      <div className="form-group">
        <label className="form-label">Client / Owner</label>
        <input name="client" className="form-control" value={form.client} onChange={handle} placeholder="Client name" />
      </div>
      <div className="form-group">
        <label className="form-label">Status</label>
        <select name="status" className="form-control" value={form.status} onChange={handle}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Start Date</label>
        <input name="start_date" type="date" className="form-control" value={form.start_date || ''} onChange={handle} />
      </div>
      <div className="form-group">
        <label className="form-label">End Date</label>
        <input name="end_date" type="date" className="form-control" value={form.end_date || ''} onChange={handle} />
      </div>
      <div className="form-group">
        <label className="form-label">Budget (₹)</label>
        <input name="budget" type="number" min="0" step="0.01" className="form-control" value={form.budget} onChange={handle} placeholder="0.00" />
      </div>
      <div className="form-group full">
        <label className="form-label">Description</label>
        <textarea name="description" className="form-control" value={form.description} onChange={handle} placeholder="Project details..." rows={3} />
      </div>
      <div className="form-group full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
          {saving ? <><i className="fa fa-spinner fa-spin" /> Saving...</> : <><i className="fa fa-check" /> Save Project</>}
        </button>
      </div>
    </div>
  );
}

const STATUS_COLORS = { active: '#22c55e', completed: '#3b82f6', 'on-hold': '#f59e0b', cancelled: '#94a3b8' };
const FMT = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Projects() {
  const showToast = useContext(ToastContext);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | {project}
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = () => {
    setLoading(true);
    projectsApi.list()
      .done(setProjects)
      .fail((xhr) => showToast(xhr.status === 0 ? 'Cannot connect to server — is the backend running on port 5000?' : 'Failed to load projects', 'error'))
      .always(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = (form) => {
    if (!form.name.trim()) return;
    setSaving(true);
    const isEdit = modal && modal.id;
    const call = isEdit ? projectsApi.update(modal.id, form) : projectsApi.create(form);
    call
      .done((p) => {
        showToast(isEdit ? 'Project updated!' : 'Project created!');
        setModal(null);
        load();
      })
      .fail((xhr) => {
        let msg = 'Save failed';
        if (xhr.status === 0) msg = 'Cannot connect to server — make sure the backend is running on port 5000.';
        else if (xhr.responseJSON?.error) msg = xhr.responseJSON.error;
        else msg = `Server error (${xhr.status}): ${xhr.statusText}`;
        showToast(msg, 'error');
      })
      .always(() => setSaving(false));
  };

  const handleDelete = (p) => {
    if (!window.confirm(`Delete project "${p.name}"? All associated transactions will lose their project link.`)) return;
    projectsApi.remove(p.id)
      .done(() => { showToast('Project deleted'); load(); })
      .fail(() => showToast('Delete failed', 'error'));
  };

  const filtered = projects.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.client || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Projects <span>{projects.length} total</span></h1>
        <button className="btn btn-primary" onClick={() => setModal('add')}>
          <i className="fa fa-plus" /> New Project
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input className="form-control wide" placeholder="Search by name or client..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        {(search || filterStatus) && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatus(''); }}>Clear</button>}
      </div>

      {loading ? (
        <div className="loading-spinner"><i className="fa fa-spinner fa-spin" /> Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <i className="fa fa-folder-open" />
          <p>{projects.length === 0 ? 'No projects yet. Create your first project.' : 'No projects match the filter.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
          {filtered.map((p) => {
            const budgetUsed = p.budget > 0 ? Math.min(100, (p.total_expense / p.budget) * 100) : 0;
            const netPos = p.net_balance >= 0;
            return (
              <div key={p.id} className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{p.name}</div>
                    {p.client && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}><i className="fa fa-building" /> {p.client}</div>}
                  </div>
                  <span className="badge" style={{ background: STATUS_COLORS[p.status] + '22', color: STATUS_COLORS[p.status] }}>
                    {p.status}
                  </span>
                </div>

                {p.description && <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '14px', lineHeight: 1.5 }}>{p.description}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ textAlign: 'center', background: '#f0fdf4', borderRadius: 8, padding: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase' }}>Income</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#16a34a' }}>{FMT(p.total_income)}</div>
                  </div>
                  <div style={{ textAlign: 'center', background: '#fef2f2', borderRadius: 8, padding: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>Expense</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#dc2626' }}>{FMT(p.total_expense)}</div>
                  </div>
                  <div style={{ textAlign: 'center', background: netPos ? '#eff6ff' : '#fffbeb', borderRadius: 8, padding: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: netPos ? '#2563eb' : '#d97706', fontWeight: 700, textTransform: 'uppercase' }}>Net</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: netPos ? '#2563eb' : '#d97706' }}>{FMT(p.net_balance)}</div>
                  </div>
                </div>

                {p.budget > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                      <span>Budget Used</span><span>{budgetUsed.toFixed(1)}% of {FMT(p.budget)}</span>
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                      <div style={{ width: budgetUsed + '%', height: '100%', background: budgetUsed > 90 ? '#ef4444' : budgetUsed > 70 ? '#f59e0b' : '#22c55e', borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    <i className="fa fa-receipt" /> {p.transaction_count} transactions
                    {p.start_date && <span style={{ marginLeft: 8 }}><i className="fa fa-calendar" /> {p.start_date}</span>}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => setModal(p)}><i className="fa fa-pen" /></button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDelete(p)}><i className="fa fa-trash" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal
          title={modal === 'add' ? 'New Project' : `Edit: ${modal.name}`}
          onClose={() => setModal(null)}
          size="lg"
        >
          <ProjectForm
            initial={modal === 'add' ? EMPTY_FORM : modal}
            onSave={handleSave}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  );
}
