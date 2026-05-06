import React, { useState, useEffect, useCallback, useContext } from 'react';
import { upcomingApi, projectsApi, categoriesApi } from '../api';
import { ToastContext } from '../App';
import './Upcoming.css';

const FMT = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RECURRENCE = ['none','daily','weekly','monthly','yearly'];

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

function dueBadge(item) {
  if (item.status === 'paid')    return { label: 'Paid',        cls: 'due-paid' };
  if (item.status === 'overdue') return { label: 'Overdue',     cls: 'due-overdue' };
  const diff = daysUntil(item.due_date);
  if (diff === 0) return { label: 'Due Today',    cls: 'due-today' };
  if (diff === 1) return { label: 'Due Tomorrow', cls: 'due-tomorrow' };
  if (diff <= 3)  return { label: `In ${diff}d`,  cls: 'due-soon' };
  return { label: `In ${diff}d`, cls: 'due-upcoming' };
}

const EMPTY = { title:'', amount:'', type:'expense', project_id:'', category_id:'', due_date:'', recurrence:'none', notes:'' };

export default function Upcoming() {
  const showToast = useContext(ToastContext);

  const [items,      setItems]      = useState([]);
  const [summary,    setSummary]    = useState(null);
  const [projects,   setProjects]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');   // all | income | expense | overdue | week | paid
  const [projFilter, setProjFilter] = useState('');
  const [modal,      setModal]      = useState(null);    // null | 'add' | 'edit'
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [payingId,   setPayingId]   = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter === 'income')  params.type   = 'income';
    if (filter === 'expense') params.type   = 'expense';
    if (filter === 'overdue') params.status = 'overdue';
    if (filter === 'paid')    params.status = 'paid';
    if (filter === 'week')    params.range  = '7';
    if (projFilter)           params.project_id = projFilter;

    Promise.all([
      upcomingApi.list(params),
      upcomingApi.summary(),
    ]).then(([rows, sum]) => {
      setItems(rows);
      setSummary(sum);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [filter, projFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    projectsApi.list().done(setProjects);
    categoriesApi.list().done(setCategories);
  }, []);

  const filteredCats = categories.filter((c) => !form.type || c.type === form.type);

  const openAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setForm({ ...EMPTY, due_date: today });
    setModal('add');
  };

  const openEdit = (item) => {
    setForm({
      title: item.title, amount: item.amount, type: item.type,
      project_id: item.project_id || '', category_id: item.category_id || '',
      due_date: item.due_date, recurrence: item.recurrence || 'none',
      notes: item.notes || '', status: item.status,
    });
    setModal({ mode: 'edit', id: item.id });
  };

  const handleForm = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value, ...(name === 'type' ? { category_id: '' } : {}) }));
  };

  const save = async () => {
    if (!form.title.trim() || !form.amount || !form.due_date)
      return showToast('Title, amount and due date are required', 'error');
    setSaving(true);
    try {
      if (modal === 'add') {
        await upcomingApi.create(form);
        showToast('Upcoming entry added');
      } else {
        await upcomingApi.update(modal.id, form);
        showToast('Entry updated');
      }
      setModal(null);
      load();
    } catch { showToast('Save failed', 'error'); }
    finally  { setSaving(false); }
  };

  const markPaid = async (id) => {
    setPayingId(id);
    try {
      await upcomingApi.pay(id);
      showToast('Marked as paid — transaction recorded', 'success');
      load();
    } catch { showToast('Failed to mark paid', 'error'); }
    finally  { setPayingId(null); }
  };

  const confirmDelete = async () => {
    try {
      await upcomingApi.remove(deleteId);
      showToast('Entry deleted');
      load();
    } catch { showToast('Delete failed', 'error'); }
    finally  { setDeleteId(null); }
  };

  const overdueCount = summary?.overdue?.count || 0;
  const upcomingInc  = summary?.month_income?.amount  || 0;
  const upcomingExp  = summary?.month_expense?.amount || 0;
  const netUpcoming  = upcomingInc - upcomingExp;

  return (
    <div className="upc-page">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Upcoming <span>Scheduled Transactions</span></h1>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <i className="fa fa-plus" /> Add Upcoming
        </button>
      </div>

      {/* ── Summary Bar ──────────────────────────────────────── */}
      <div className="upc-summary-row">
        <div className="upc-sum-card upc-sum-income">
          <div className="upc-sum-icon"><i className="fa fa-arrow-trend-up" /></div>
          <div>
            <div className="upc-sum-label">Upcoming Income (30d)</div>
            <div className="upc-sum-val">{FMT(upcomingInc)}</div>
          </div>
        </div>
        <div className="upc-sum-card upc-sum-expense">
          <div className="upc-sum-icon"><i className="fa fa-arrow-trend-down" /></div>
          <div>
            <div className="upc-sum-label">Upcoming Expense (30d)</div>
            <div className="upc-sum-val">{FMT(upcomingExp)}</div>
          </div>
        </div>
        <div className={`upc-sum-card ${netUpcoming >= 0 ? 'upc-sum-net-pos' : 'upc-sum-net-neg'}`}>
          <div className="upc-sum-icon"><i className="fa fa-scale-balanced" /></div>
          <div>
            <div className="upc-sum-label">Net (30d)</div>
            <div className="upc-sum-val">{netUpcoming < 0 ? '-' : '+'}{FMT(Math.abs(netUpcoming))}</div>
          </div>
        </div>
        <div className={`upc-sum-card ${overdueCount > 0 ? 'upc-sum-overdue' : 'upc-sum-clear'}`}>
          <div className="upc-sum-icon">
            <i className={`fa ${overdueCount > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
          </div>
          <div>
            <div className="upc-sum-label">Overdue Items</div>
            <div className="upc-sum-val">{overdueCount}</div>
          </div>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="upc-filter-row">
        <div className="upc-filter-tabs">
          {[
            { key: 'all',     label: 'All' },
            { key: 'week',    label: 'Next 7 Days' },
            { key: 'income',  label: 'Income' },
            { key: 'expense', label: 'Expense' },
            { key: 'overdue', label: `Overdue${overdueCount > 0 ? ` (${overdueCount})` : ''}` },
            { key: 'paid',    label: 'Paid' },
          ].map((t) => (
            <button key={t.key}
              className={`upc-tab${filter === t.key ? ' active' : ''}${t.key === 'overdue' && overdueCount > 0 ? ' tab-danger' : ''}`}
              onClick={() => setFilter(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <select className="form-control" style={{ maxWidth: 200 }}
          value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* ── Today's Items Alert ───────────────────────────────── */}
      {summary?.today?.length > 0 && (
        <div className="upc-today-alert">
          <i className="fa fa-bell" />
          <strong>Due Today:</strong>
          {summary.today.map((t) => (
            <span key={t.id} className={`upc-today-pill ${t.type}`}>
              {t.title} — {FMT(t.amount)}
            </span>
          ))}
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="loading-spinner"><i className="fa fa-spinner fa-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <i className="fa fa-calendar-xmark" />
          <p>No upcoming entries found</p>
        </div>
      ) : (
        <div className="upc-list">
          {items.map((item) => {
            const badge    = dueBadge(item);
            const diff     = daysUntil(item.due_date);
            const isTomorrow = item.status !== 'paid' && diff === 1;
            return (
              <div key={item.id} className={`upc-item ${item.type} ${item.status === 'overdue' ? 'is-overdue' : ''} ${item.status === 'paid' ? 'is-paid' : ''} ${isTomorrow ? 'is-tomorrow' : ''}`}>
                {/* Left accent */}
                <div className={`upc-accent ${item.type}`} />

                {/* Icon */}
                <div className={`upc-icon ${item.type}`}>
                  <i className={`fa fa-${item.type === 'income' ? 'arrow-down' : 'arrow-up'}`} />
                </div>

                {/* Info */}
                <div className="upc-info">
                  <div className="upc-title">{item.title}</div>
                  <div className="upc-meta">
                    {item.project_name && <><i className="fa fa-folder" /> {item.project_name} &nbsp;·&nbsp;</>}
                    {item.category_name && <><span className="upc-cat-dot" style={{ background: item.category_color || '#94a3b8' }} />{item.category_name} &nbsp;·&nbsp;</>}
                    <i className="fa fa-rotate" /> {item.recurrence !== 'none' ? item.recurrence : 'one-time'}
                    {item.notes && <> &nbsp;·&nbsp; <i className="fa fa-note-sticky" /> {item.notes}</>}
                  </div>
                </div>

                {/* Due date */}
                <div className="upc-due">
                  <div className="upc-due-date">{item.due_date}</div>
                  <span className={`upc-badge ${badge.cls}`}>{badge.label}</span>
                  {item.status !== 'paid' && diff < 0 && (
                    <div className="upc-overdue-days">{Math.abs(diff)}d overdue</div>
                  )}
                </div>

                {/* Amount */}
                <div className={`upc-amount ${item.type}`}>
                  {item.type === 'income' ? '+' : '-'}{FMT(item.amount)}
                </div>

                {/* Actions */}
                <div className="upc-actions">
                  {item.status !== 'paid' && (
                    <button className="btn btn-success btn-sm"
                      onClick={() => markPaid(item.id)}
                      disabled={payingId === item.id}>
                      {payingId === item.id
                        ? <i className="fa fa-spinner fa-spin" />
                        : <><i className="fa fa-check" /> Paid</>}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                    <i className="fa fa-pen" />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(item.id)}>
                    <i className="fa fa-trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">
                <i className={`fa ${modal === 'add' ? 'fa-plus-circle' : 'fa-pen'}`} style={{ marginRight: 8 }} />
                {modal === 'add' ? 'Add Upcoming Entry' : 'Edit Entry'}
              </span>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="modal-body">
              {/* Type toggle */}
              <div className="upc-type-toggle">
                {['income','expense'].map((t) => (
                  <button key={t}
                    className={`upc-type-btn ${form.type === t ? `active-${t}` : ''}`}
                    onClick={() => setForm((f) => ({ ...f, type: t, category_id: '' }))}>
                    <i className={`fa fa-${t === 'income' ? 'arrow-trend-up' : 'arrow-trend-down'}`} />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="form-group full">
                  <label className="form-label">Title <span className="req">*</span></label>
                  <input name="title" className="form-control" value={form.title}
                    onChange={handleForm} placeholder="e.g. Office Rent, Salary, Client Invoice…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount <span className="req">*</span></label>
                  <input name="amount" type="number" min="0" step="0.01" className="form-control"
                    value={form.amount} onChange={handleForm} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date <span className="req">*</span></label>
                  <input name="due_date" type="date" className="form-control"
                    value={form.due_date} onChange={handleForm} />
                </div>
                <div className="form-group">
                  <label className="form-label">Project</label>
                  <select name="project_id" className="form-control" value={form.project_id} onChange={handleForm}>
                    <option value="">— No Project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select name="category_id" className="form-control" value={form.category_id} onChange={handleForm}>
                    <option value="">— Select Category —</option>
                    {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Recurrence</label>
                  <select name="recurrence" className="form-control" value={form.recurrence} onChange={handleForm}>
                    {RECURRENCE.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                {modal?.mode === 'edit' && (
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select name="status" className="form-control" value={form.status} onChange={handleForm}>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                )}
                <div className="form-group full">
                  <label className="form-label">Notes</label>
                  <textarea name="notes" className="form-control" rows={2}
                    value={form.notes} onChange={handleForm} placeholder="Optional notes…" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className={`btn btn-${form.type === 'income' ? 'success' : 'danger'}`}
                onClick={save} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-save" /> Save Entry</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────── */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title"><i className="fa fa-trash" style={{ color: '#ef4444', marginRight: 8 }} />Confirm Delete</span>
              <button className="modal-close" onClick={() => setDeleteId(null)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#475569' }}>Are you sure you want to delete this upcoming entry? This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}><i className="fa fa-trash" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
