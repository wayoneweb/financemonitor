import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import $ from 'jquery';
import { projectsApi, categoriesApi, transactionsApi } from '../api';
import { ToastContext } from '../App';
import './AddTransaction.css';

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',            icon: 'fa-money-bill-wave' },
  { value: 'bank_transfer', label: 'Bank Transfer',   icon: 'fa-building-columns' },
  { value: 'cheque',        label: 'Cheque',          icon: 'fa-file-invoice' },
  { value: 'card',          label: 'Card',            icon: 'fa-credit-card' },
  { value: 'upi',           label: 'UPI / Mobile',    icon: 'fa-mobile-screen' },
  { value: 'online',        label: 'Online',          icon: 'fa-globe' },
  { value: 'other',         label: 'Other',           icon: 'fa-ellipsis' },
];

const STATUSES = [
  { value: 'confirmed', label: '✅ Confirmed' },
  { value: 'pending',   label: '🕐 Pending'   },
  { value: 'cancelled', label: '❌ Cancelled'  },
];

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  type: 'income',
  project_id: '', category_id: '',
  title: '', description: '',
  amount: '', currency: 'INR',
  date: today(),
  reference_no: '', payment_method: 'bank_transfer',
  party_name: '', tax_amount: '', discount: '',
  notes: '', status: 'confirmed',
};

function fileBoxClass(mime) {
  if (!mime) return 'generic';
  if (mime.startsWith('image/')) return 'img';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word')) return 'doc';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'xls';
  return 'generic';
}

function fileIconName(mime) {
  if (!mime) return 'fa-file';
  if (mime.startsWith('image/')) return 'fa-image';
  if (mime === 'application/pdf') return 'fa-file-pdf';
  if (mime.includes('word')) return 'fa-file-word';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'fa-file-excel';
  return 'fa-file-lines';
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function AddTransaction({ editData, onSaved }) {
  const showToast  = useContext(ToastContext);
  const navigate   = useNavigate();
  const fileRef    = useRef(null);

  const [form, setForm] = useState(
    editData
      ? { ...EMPTY, ...editData, project_id: editData.project_id || '', category_id: editData.category_id || '' }
      : EMPTY
  );
  const [projects,  setProjects]  = useState([]);
  const [categories,setCategories]= useState([]);
  const [file,      setFile]      = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [errors,    setErrors]    = useState({});
  const [dragover,  setDragover]  = useState(false);

  const isEdit = !!editData;
  const isIncome = form.type === 'income';
  const accent = isIncome ? 'income' : 'expense';

  useEffect(() => {
    projectsApi.list().done(setProjects);
    categoriesApi.list().done(setCategories);
  }, []);

  const filteredCats = categories.filter((c) => c.type === form.type);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!form.date) errs.date = 'Date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFile = (f) => {
    if (f && f.size > 10 * 1024 * 1024) { showToast('File must be under 10 MB', 'error'); return; }
    setFile(f || null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      $('#txn-form').css('animation', 'none').offset();
      $('#txn-form').css('animation', 'shake 0.4s ease');
      return;
    }
    setSaving(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (file) fd.append('attachment', file);

    const call = isEdit ? transactionsApi.update(editData.id, fd) : transactionsApi.create(fd);
    call
      .done((saved) => {
        showToast(isEdit ? 'Transaction updated!' : `${isIncome ? 'Income' : 'Expense'} recorded successfully!`);
        if (onSaved) { onSaved(saved); return; }
        navigate('/history');
      })
      .fail((xhr) => showToast(xhr.responseJSON?.error || 'Failed to save', 'error'))
      .always(() => setSaving(false));
  };

  const net = (Number(form.amount) || 0) + (Number(form.tax_amount) || 0) - (Number(form.discount) || 0);
  const showNet = (form.tax_amount || form.discount) && form.amount;
  const amtFill = Math.min(100, ((Number(form.amount) || 0) / 100000) * 100);

  return (
    <div className="txn-page">
      {/* Page header */}
      {!isEdit && (
        <div className="txn-page-header">
          <div>
            <div className="txn-page-title">
              <i className={`fa fa-${isIncome ? 'arrow-trend-up' : 'arrow-trend-down'}`}
                 style={{ color: isIncome ? '#10b981' : '#ef4444', marginRight: 10 }} />
              {isIncome ? 'Record Income' : 'Record Expense'}
            </div>
            <div className="txn-page-subtitle">Fill in the details below to log this transaction</div>
          </div>
        </div>
      )}

      <form id="txn-form" onSubmit={handleSubmit}>

        {/* ── Type Toggle ──────────────────────────────────────── */}
        <div className="txn-type-row">
          <button type="button"
            className={`txn-type-btn ${form.type === 'income' ? 'active-income' : ''}`}
            onClick={() => { set('type', 'income'); set('category_id', ''); }}>
            <div className="type-icon-wrap"><i className="fa fa-arrow-trend-up" /></div>
            Income / Receipt
          </button>
          <button type="button"
            className={`txn-type-btn ${form.type === 'expense' ? 'active-expense' : ''}`}
            onClick={() => { set('type', 'expense'); set('category_id', ''); }}>
            <div className="type-icon-wrap"><i className="fa fa-arrow-trend-down" /></div>
            Expense / Payment
          </button>
        </div>

        {/* ── Amount Hero ──────────────────────────────────────── */}
        <div className="txn-section">
          <div className="amount-hero">
            <div className={`amount-hero-label ${accent}`}>
              {isIncome ? '💰 Enter Income Amount' : '💸 Enter Expense Amount'}
            </div>
            <div className="amount-hero-input-wrap">
              <span className="amount-hero-symbol">$</span>
              <input
                className={`amount-hero-input ${accent}`}
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="amount-underline">
              <div className={`amount-underline-fill ${accent}`} style={{ width: form.amount ? Math.max(6, amtFill) + '%' : '0%' }} />
            </div>
            {errors.amount && <div className="amount-err"><i className="fa fa-triangle-exclamation" /> {errors.amount}</div>}
            {showNet && (
              <div className={`net-pill ${accent}`}>
                <i className="fa fa-calculator" />
                Net after tax &amp; discount: <strong>${net.toFixed(2)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ── Core Details ─────────────────────────────────────── */}
        <div className="txn-section">
          <div className="txn-section-header">
            <div className="txn-section-icon" style={{ background: isIncome ? '#dcfce7' : '#fee2e2', color: isIncome ? '#16a34a' : '#dc2626' }}>
              <i className="fa fa-pen-to-square" />
            </div>
            <span className="txn-section-title">Transaction Details</span>
          </div>
          <div className="txn-section-body">
            <div className="txn-grid">
              {/* Title */}
              <div className="txn-field fg3">
                <label className="txn-label">Title / Description <span className="req">*</span></label>
                <input
                  className={`txn-input ${accent}-focus ${errors.title ? 'err' : ''}`}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder={isIncome ? 'e.g. Project Milestone Payment, Consulting Fee…' : 'e.g. Adobe CC License, Office Supplies…'}
                />
                {errors.title && <span className="field-err"><i className="fa fa-circle-exclamation" /> {errors.title}</span>}
              </div>

              {/* Project */}
              <div className="txn-field fg2">
                <label className="txn-label"><i className="fa fa-folder" /> Project</label>
                <select className={`txn-select ${accent}-focus`} value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                  <option value="">— No Project —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Category */}
              <div className="txn-field">
                <label className="txn-label"><i className="fa fa-tag" /> Category</label>
                <select className={`txn-select ${accent}-focus`} value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">— Select —</option>
                  {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Date */}
              <div className="txn-field">
                <label className="txn-label"><i className="fa fa-calendar" /> Date <span className="req">*</span></label>
                <input type="date" className={`txn-input ${accent}-focus ${errors.date ? 'err' : ''}`} value={form.date} onChange={(e) => set('date', e.target.value)} />
                {errors.date && <span className="field-err">{errors.date}</span>}
              </div>

              {/* Reference */}
              <div className="txn-field">
                <label className="txn-label"><i className="fa fa-hashtag" /> Reference / Invoice No.</label>
                <input className={`txn-input ${accent}-focus`} value={form.reference_no} onChange={(e) => set('reference_no', e.target.value)} placeholder="e.g. INV-2026-001" />
              </div>

              {/* Party Name */}
              <div className="txn-field">
                <label className="txn-label">
                  <i className={`fa fa-${isIncome ? 'user-tie' : 'store'}`} />
                  {isIncome ? 'Client / Payer' : 'Vendor / Payee'}
                </label>
                <input className={`txn-input ${accent}-focus`} value={form.party_name} onChange={(e) => set('party_name', e.target.value)} placeholder={isIncome ? 'Client name' : 'Vendor name'} />
              </div>

              {/* Status */}
              <div className="txn-field">
                <label className="txn-label"><i className="fa fa-circle-dot" /> Status</label>
                <select className={`txn-select ${accent}-focus`} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Payment Method ───────────────────────────────────── */}
        <div className="txn-section">
          <div className="txn-section-header">
            <div className="txn-section-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
              <i className="fa fa-credit-card" />
            </div>
            <span className="txn-section-title">Payment Method</span>
          </div>
          <div className="txn-section-body">
            <div className="method-pills">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.value} type="button"
                  className={`method-pill ${form.payment_method === m.value ? `active-${accent}` : ''}`}
                  onClick={() => set('payment_method', m.value)}>
                  <i className={`fa ${m.icon}`} /> {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Financial Adjustments ────────────────────────────── */}
        <div className="txn-section">
          <div className="txn-section-header">
            <div className="txn-section-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}>
              <i className="fa fa-calculator" />
            </div>
            <span className="txn-section-title">Tax, Discount &amp; Notes</span>
          </div>
          <div className="txn-section-body">
            <div className="txn-grid">
              <div className="txn-field">
                <label className="txn-label"><i className="fa fa-percent" /> Tax Amount</label>
                <input type="number" min="0" step="0.01" className={`txn-input ${accent}-focus`} value={form.tax_amount} onChange={(e) => set('tax_amount', e.target.value)} placeholder="0.00" />
              </div>
              <div className="txn-field">
                <label className="txn-label"><i className="fa fa-tag" /> Discount</label>
                <input type="number" min="0" step="0.01" className={`txn-input ${accent}-focus`} value={form.discount} onChange={(e) => set('discount', e.target.value)} placeholder="0.00" />
              </div>
              {showNet && (
                <div className="txn-field">
                  <label className="txn-label">Net Amount</label>
                  <div style={{ padding: '10px 14px', borderRadius: 10, fontWeight: 800, fontSize: '1rem', background: isIncome ? '#dcfce7' : '#fee2e2', color: isIncome ? '#15803d' : '#b91c1c', border: `1.5px solid ${isIncome ? '#86efac' : '#fca5a5'}` }}>
                    ${net.toFixed(2)}
                  </div>
                </div>
              )}
              <div className="txn-field fg3">
                <label className="txn-label"><i className="fa fa-align-left" /> Internal Description / Particulars</label>
                <textarea className={`txn-input ${accent}-focus`} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What is this transaction for? Add internal notes…" rows={2} />
              </div>
              <div className="txn-field fg3">
                <label className="txn-label"><i className="fa fa-note-sticky" /> Additional Notes</label>
                <textarea className={`txn-input ${accent}-focus`} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Any extra remarks, follow-ups, or context…" rows={2} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Attachment ───────────────────────────────────────── */}
        <div className="txn-section">
          <div className="txn-section-header">
            <div className="txn-section-icon" style={{ background: isIncome ? '#dcfce7' : '#fee2e2', color: isIncome ? '#16a34a' : '#dc2626' }}>
              <i className="fa fa-paperclip" />
            </div>
            <span className="txn-section-title">{isIncome ? 'Income Proof / Receipt' : 'Bill / Payment Proof'}</span>
          </div>
          <div className="txn-section-body">
            {/* Existing file in edit mode */}
            {isEdit && editData.attachment_name && !file && (
              <div className="txn-file-preview" style={{ marginBottom: 14 }}>
                <div className={`file-icon-box ${fileBoxClass(editData.attachment_type)}`}>
                  <i className={`fa ${fileIconName(editData.attachment_type)}`} />
                </div>
                <div className="file-meta">
                  <div className="fn">{editData.attachment_name}</div>
                  <div className="fs">Existing attachment</div>
                </div>
                <a href={`/api/uploads/${editData.attachment_path}`} target="_blank" rel="noreferrer"
                   style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fa fa-eye" /> View
                </a>
              </div>
            )}

            {/* Drop zone */}
            <div
              className={`txn-file-drop ${accent}-drop ${dragover ? 'dragover' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); handleFile(e.dataTransfer.files[0]); }}
            >
              <div className={`upload-icon-circle ${file ? accent : 'default'}`}>
                <i className={`fa ${file ? 'fa-check' : 'fa-cloud-arrow-up'}`} />
              </div>
              <div className="upload-title">{file ? 'File ready — click to replace' : `Upload ${isIncome ? 'Receipt / Proof of Payment' : 'Bill / Invoice'}`}</div>
              <div className="upload-sub">Drag &amp; drop or click to browse<br />JPG, PNG, PDF, Word, Excel — max 10 MB</div>
              <input ref={fileRef} type="file" hidden accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFile(e.target.files[0])} />
            </div>

            {/* Selected file preview */}
            {file && (
              <div className="txn-file-preview">
                <div className={`file-icon-box ${fileBoxClass(file.type)}`}>
                  <i className={`fa ${fileIconName(file.type)}`} />
                </div>
                <div className="file-meta">
                  <div className="fn">{file.name}</div>
                  <div className="fs">{fmtBytes(file.size)}</div>
                </div>
                <button type="button"
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={() => { setFile(null); fileRef.current.value = ''; }}>
                  <i className="fa fa-xmark" /> Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Submit ───────────────────────────────────────────── */}
        <div className="txn-submit-bar">
          {!isEdit && (
            <button type="button" className="btn-txn-cancel" onClick={() => navigate(-1)}>
              <i className="fa fa-xmark" /> Cancel
            </button>
          )}
          <button type="submit" className={`btn-txn-submit ${accent}`} disabled={saving}>
            {saving
              ? <><i className="fa fa-spinner fa-spin" /> Saving…</>
              : <><i className={`fa fa-${isIncome ? 'arrow-trend-up' : 'arrow-trend-down'}`} />
                  {isEdit ? 'Update Transaction' : `Record ${isIncome ? 'Income' : 'Expense'}`}</>
            }
          </button>
        </div>
      </form>
    </div>
  );
}
