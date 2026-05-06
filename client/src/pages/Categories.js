import React, { useState, useEffect, useContext } from 'react';
import { categoriesApi } from '../api';
import { ToastContext } from '../App';
import './Categories.css';

const PRESET_COLORS = [
  '#10b981','#059669','#16a34a','#15803d','#166534',
  '#3b82f6','#2563eb','#1d4ed8','#6366f1','#4f46e5',
  '#8b5cf6','#7c3aed','#a855f7','#9333ea',
  '#f59e0b','#d97706','#b45309','#f97316','#ea580c',
  '#ef4444','#dc2626','#b91c1c','#e11d48','#be123c',
  '#ec4899','#db2777','#14b8a6','#0d9488','#64748b',
];

const EMPTY = { name: '', type: 'income', color: '#10b981' };

export default function Categories() {
  const showToast = useContext(ToastContext);
  const [cats,    setCats]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);   // null | 'add' | {cat}
  const [form,    setForm]    = useState(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [delId,   setDelId]   = useState(null);
  const [tab,     setTab]     = useState('income'); // 'income' | 'expense'

  const load = () => {
    setLoading(true);
    categoriesApi.list().done((rows) => { setCats(rows); setLoading(false); })
      .fail(() => setLoading(false));
  };

  useEffect(load, []);

  const income  = cats.filter((c) => c.type === 'income');
  const expense = cats.filter((c) => c.type === 'expense');
  const shown   = tab === 'income' ? income : expense;

  const openAdd = (type) => {
    setForm({ ...EMPTY, type, color: type === 'income' ? '#10b981' : '#ef4444' });
    setModal('add');
  };

  const openEdit = (cat) => {
    setForm({ name: cat.name, type: cat.type, color: cat.color || '#667eea' });
    setModal(cat);
  };

  const save = async () => {
    if (!form.name.trim()) return showToast('Category name is required', 'error');
    setSaving(true);
    try {
      if (modal === 'add') {
        await categoriesApi.create(form);
        showToast('Category added');
      } else {
        await categoriesApi.update(modal.id, form);
        showToast('Category updated');
      }
      setModal(null);
      load();
    } catch { showToast('Save failed', 'error'); }
    finally  { setSaving(false); }
  };

  const confirmDelete = async () => {
    try {
      await categoriesApi.remove(delId);
      showToast('Category deleted');
      load();
    } catch { showToast('Delete failed — category may be in use', 'error'); }
    finally  { setDelId(null); }
  };

  const delCat = cats.find((c) => c.id === delId);

  return (
    <div className="cat-page">
      <div className="page-header">
        <h1 className="page-title">
          Categories <span>{income.length} income · {expense.length} expense</span>
        </h1>
        <button className={`btn btn-${tab === 'income' ? 'success' : 'danger'}`}
          onClick={() => openAdd(tab)}>
          <i className="fa fa-plus" /> Add {tab === 'income' ? 'Income' : 'Expense'} Category
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="cat-tabs">
        <button className={`cat-tab ${tab === 'income' ? 'active-income' : ''}`}
          onClick={() => setTab('income')}>
          <i className="fa fa-arrow-trend-up" /> Income Categories
          <span className="cat-tab-count">{income.length}</span>
        </button>
        <button className={`cat-tab ${tab === 'expense' ? 'active-expense' : ''}`}
          onClick={() => setTab('expense')}>
          <i className="fa fa-arrow-trend-down" /> Expense Categories
          <span className="cat-tab-count">{expense.length}</span>
        </button>
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="loading-spinner"><i className="fa fa-spinner fa-spin" /> Loading…</div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <i className="fa fa-tags" />
          <p>No {tab} categories yet. Add one above.</p>
        </div>
      ) : (
        <div className="cat-grid">
          {shown.map((cat) => (
            <div key={cat.id} className="cat-card">
              <div className="cat-card-top">
                <div className="cat-color-swatch" style={{ background: cat.color || '#667eea' }}>
                  <i className="fa fa-tag" />
                </div>
                <div className="cat-card-info">
                  <div className="cat-card-name">{cat.name}</div>
                  <div className="cat-card-meta">
                    <span className={`badge badge-${cat.type}`}>{cat.type}</span>
                    {cat.transaction_count > 0 && (
                      <span className="cat-txn-count">
                        <i className="fa fa-receipt" /> {cat.transaction_count} txn{cat.transaction_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="cat-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(cat)}>
                  <i className="fa fa-pen" /> Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setDelId(cat.id)}>
                  <i className="fa fa-trash" />
                </button>
              </div>
            </div>
          ))}

          {/* Add new tile */}
          <button className={`cat-add-tile cat-add-${tab}`} onClick={() => openAdd(tab)}>
            <i className="fa fa-plus-circle" />
            <span>Add {tab === 'income' ? 'Income' : 'Expense'} Category</span>
          </button>
        </div>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────── */}
      {modal !== null && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">
                <i className={`fa ${modal === 'add' ? 'fa-plus-circle' : 'fa-pen'}`} style={{ marginRight: 8 }} />
                {modal === 'add' ? `Add ${form.type} Category` : `Edit "${modal.name}"`}
              </span>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fa fa-xmark" /></button>
            </div>

            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Category Name <span className="req">*</span></label>
                <input className="form-control" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Office Rent, Freelance Income…"
                  autoFocus />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Type</label>
                <div className="cat-type-toggle">
                  {['income', 'expense'].map((t) => (
                    <button key={t}
                      className={`cat-type-btn ${form.type === t ? `active-${t}` : ''}`}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}>
                      <i className={`fa fa-${t === 'income' ? 'arrow-trend-up' : 'arrow-trend-down'}`} />
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-picker-wrap">
                  <div className="color-presets">
                    {PRESET_COLORS.map((c) => (
                      <button key={c} className={`color-dot ${form.color === c ? 'selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        title={c}
                      />
                    ))}
                  </div>
                  <div className="color-custom-row">
                    <span className="form-label" style={{ marginBottom: 0 }}>Custom:</span>
                    <input type="color" className="color-input-native"
                      value={form.color}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                    <div className="color-preview-pill" style={{ background: form.color }}>
                      <i className="fa fa-tag" /> {form.name || 'Preview'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className={`btn btn-${form.type === 'income' ? 'success' : 'danger'}`}
                onClick={save} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> Save Category</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────── */}
      {delId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">
                <i className="fa fa-trash" style={{ color: '#ef4444', marginRight: 8 }} />Delete Category
              </span>
              <button className="modal-close" onClick={() => setDelId(null)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#475569', marginBottom: 10 }}>
                Delete <strong>"{delCat?.name}"</strong>?
              </p>
              {delCat?.transaction_count > 0 && (
                <div className="cat-del-warning">
                  <i className="fa fa-triangle-exclamation" />
                  This category is used in <strong>{delCat.transaction_count}</strong> transaction{delCat.transaction_count !== 1 ? 's' : ''}.
                  Those transactions will become uncategorised.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDelId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                <i className="fa fa-trash" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
