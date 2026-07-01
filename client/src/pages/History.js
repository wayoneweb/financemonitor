import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { transactionsApi, projectsApi, categoriesApi, exportApi } from '../api';
import Modal from '../components/Modal';
import AddTransaction from './AddTransaction';
import { ToastContext } from '../App';
import './History.css';

const FMT = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAYMENT_LABELS = { cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', card: 'Card', upi: 'UPI', online: 'Online', other: 'Other' };

function fileIcon(mime) {
  if (!mime) return 'fa-file';
  if (mime.startsWith('image/')) return 'fa-image';
  if (mime === 'application/pdf') return 'fa-file-pdf';
  return 'fa-file-lines';
}

export default function History() {
  const showToast = useContext(ToastContext);
  const location  = useLocation();
  const navigate  = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [summary,      setSummary]      = useState({});
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [pages,        setPages]        = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [projects,     setProjects]     = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [modal,        setModal]        = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // tx pending delete
  const [deleting,      setDeleting]      = useState(false);

  const [filters, setFilters] = useState({
    type: '', project_id: '', category_id: '', status: '',
    payment_method: '', date_from: '', date_to: '', search: '',
  });
  const LIMIT = 15;

  useEffect(() => {
    projectsApi.list().done(setProjects);
    categoriesApi.list().done(setCategories);
    const params = new URLSearchParams(location.search);
    if (params.get('status')) { setFilters((f) => ({ ...f, status: params.get('status') })); setFilterOpen(true); }
  }, [location.search]);

  const load = useCallback(() => {
    setLoading(true);
    const params = { ...filters, page, limit: LIMIT };
    Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
    transactionsApi.list(params)
      .done((res) => { setTransactions(res.data); setTotal(res.total); setPages(res.pages); })
      .fail(() => showToast('Failed to load', 'error'))
      .always(() => setLoading(false));
    transactionsApi.summary(params).done(setSummary);
  }, [filters, page, showToast]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const clearFilters = () => {
    setFilters({ type: '', project_id: '', category_id: '', status: '', payment_method: '', date_from: '', date_to: '', search: '' });
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await new Promise((resolve, reject) =>
        transactionsApi.remove(deleteConfirm.id).done(resolve).fail(reject)
      );
      showToast('Transaction deleted successfully');
      setDeleteConfirm(null);
      load();
    } catch {
      showToast('Delete failed — please try again', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filteredCats = categories.filter((c) => !filters.type || c.type === filters.type);
  const hasFilters   = Object.values(filters).some(Boolean);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const [filterOpen, setFilterOpen] = useState(false);
  const [exporting,  setExporting]  = useState(null); // 'pdf' | 'excel' | null

  const exportParams = () => {
    const p = { ...filters };
    Object.keys(p).forEach((k) => { if (!p[k]) delete p[k]; });
    return p;
  };

  const handleExport = async (type) => {
    setExporting(type);
    const params = exportParams();
    const url = type === 'excel' ? exportApi.excelUrl(params) : exportApi.pdfUrl(params);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `finance-${type}-${Date.now()}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      showToast('Export failed — ' + err.message, 'error');
    } finally {
      setExporting(null);
    }
  };

  const pageNumbers = () => {
    const p = [], range = 2;
    for (let i = Math.max(1, page - range); i <= Math.min(pages, page + range); i++) p.push(i);
    return p;
  };

  return (
    <div>
      {/* ── Banner Header ─────────────────────────────────────── */}
      <div className="hist-header">
        <div className="hist-header-inner">
          <div className="hist-header-left">
            <div className="hist-header-icon">
              <i className="fa fa-clock-rotate-left" />
            </div>
            <div>
              <div className="hist-header-title">Transaction History</div>
              <div className="hist-header-sub">
                {total} records{hasFilters ? ` · filtered view (${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active)` : ' · all time'}
              </div>
            </div>
          </div>
          <div className="hist-header-actions">
            <button className={`hist-btn-filter${filterOpen ? ' active' : ''}`} onClick={() => setFilterOpen(o => !o)}>
              <i className="fa fa-filter" /> Filters
              {activeFilterCount > 0 && <span className="hist-filter-badge">{activeFilterCount}</span>}
            </button>
            <button className="hist-btn-add" onClick={() => navigate('/add-transaction')}>
              <i className="fa fa-plus" /> Add Transaction
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────── */}
      <div className="hist-summary-grid">
        <div className="hist-stat income-stat">
          <div className="hist-stat-icon"><i className="fa fa-arrow-trend-up" /></div>
          <div className="hist-stat-info">
            <div className="hist-stat-label">Total Income</div>
            <div className="hist-stat-value">{filters.type !== 'expense' ? FMT(summary.total_income) : '—'}</div>
          </div>
        </div>
        <div className="hist-stat expense-stat">
          <div className="hist-stat-icon"><i className="fa fa-arrow-trend-down" /></div>
          <div className="hist-stat-info">
            <div className="hist-stat-label">Total Expense</div>
            <div className="hist-stat-value">{filters.type !== 'income' ? FMT(summary.total_expense) : '—'}</div>
          </div>
        </div>
        <div className="hist-stat net-stat">
          <div className="hist-stat-icon"><i className="fa fa-scale-balanced" /></div>
          <div className="hist-stat-info">
            <div className="hist-stat-label">Net Balance</div>
            <div className={`hist-stat-value ${(summary.net || 0) < 0 ? 'negative' : ''}`}>{FMT(summary.net)}</div>
          </div>
        </div>
        <div className="hist-stat count-stat">
          <div className="hist-stat-icon"><i className="fa fa-receipt" /></div>
          <div className="hist-stat-info">
            <div className="hist-stat-label">Records Found</div>
            <div className="hist-stat-value">{summary.count || 0}</div>
          </div>
        </div>
      </div>

      {/* ── Filter Panel ──────────────────────────────────────── */}
      {filterOpen && <div className="hist-filter-card">
        <div className="hist-filter-header">
          <div className="hist-filter-header-left">
            <div className="hist-filter-icon"><i className="fa fa-filter" /></div>
            <span className="hist-filter-title">
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount} active` : ''}
            </span>
          </div>
        </div>
        <div className="hist-filter-body">
          {/* Search full-width */}
          <div className="hist-search-row">
            <div className="hist-filter-label">Search</div>
            <input
              className="hist-filter-input"
              placeholder="Search by title, party name, reference number…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </div>

          {/* 4-column filter grid */}
          <div className="hist-filter-grid">
            <div>
              <div className="hist-filter-label">Type</div>
              <select className="hist-filter-input" value={filters.type} onChange={(e) => { setFilter('type', e.target.value); setFilter('category_id', ''); }}>
                <option value="">All Types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <div className="hist-filter-label">Project</div>
              <select className="hist-filter-input" value={filters.project_id} onChange={(e) => setFilter('project_id', e.target.value)}>
                <option value="">All Projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div className="hist-filter-label">Category</div>
              <select className="hist-filter-input" value={filters.category_id} onChange={(e) => setFilter('category_id', e.target.value)}>
                <option value="">All Categories</option>
                {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div className="hist-filter-label">Status</div>
              <select className="hist-filter-input" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <div className="hist-filter-label">Payment Method</div>
              <select className="hist-filter-input" value={filters.payment_method} onChange={(e) => setFilter('payment_method', e.target.value)}>
                <option value="">All Methods</option>
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div className="hist-filter-label">From Date</div>
              <input type="date" className="hist-filter-input" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} />
            </div>
            <div>
              <div className="hist-filter-label">To Date</div>
              <input type="date" className="hist-filter-input" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} />
            </div>
          </div>

          {/* Export row */}
          <div className="hist-export-row">
            <div className={`hist-export-info ${hasFilters ? 'active' : ''}`}>
              {hasFilters
                ? <><i className="fa fa-circle-check" /> Exporting {summary.count || 0} filtered records</>
                : <><i className="fa fa-circle-info" /> No filters active — export will include all records</>}
            </div>
            <div className="hist-export-btns">
              {hasFilters && (
                <button className="hist-btn-clear" onClick={clearFilters}>
                  <i className="fa fa-xmark" /> Clear
                </button>
              )}
              <button
                className="hist-export-btn excel"
                onClick={() => handleExport('excel')}
                disabled={!!exporting}
              >
                {exporting === 'excel'
                  ? <><i className="fa fa-spinner fa-spin" /> Generating…</>
                  : <><i className="fa fa-file-excel" /> Export Excel</>}
              </button>
              <button
                className="hist-export-btn pdf"
                onClick={() => handleExport('pdf')}
                disabled={!!exporting}
              >
                {exporting === 'pdf'
                  ? <><i className="fa fa-spinner fa-spin" /> Generating…</>
                  : <><i className="fa fa-file-pdf" /> Export PDF</>}
              </button>
            </div>
          </div>
        </div>
      </div>}

      {/* ── Transactions Table ─────────────────────────────────── */}
      <div className="hist-table-card">
        <div className="hist-table-header">
          <div className="hist-table-title">
            <div className="hist-table-title-icon"><i className="fa fa-list" /></div>
            Transactions
          </div>
          <span className="hist-count-badge">{total} records</span>
        </div>

        {loading ? (
          <div className="loading-spinner"><i className="fa fa-spinner fa-spin" /> Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <i className="fa fa-inbox" />
            <p>No transactions found{hasFilters ? ' for the selected filters' : '. Add your first transaction.'}.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Project</th>
                    <th>Category</th>
                    <th>Party / Vendor</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Proof</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={`${tx.type}-row`}>
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.82rem' }}>{tx.date}</td>
                      <td><span className={`badge badge-${tx.type}`}>{tx.type}</span></td>
                      <td>
                        <div style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.title}>{tx.title}</div>
                        {tx.reference_no && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Ref: {tx.reference_no}</div>}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{tx.project_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                      <td>
                        {tx.category_name
                          ? <span className="badge" style={{ background: (tx.category_color || '#94a3b8') + '20', color: tx.category_color || '#64748b' }}>{tx.category_name}</span>
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.82rem', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.party_name || '—'}</td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{PAYMENT_LABELS[tx.payment_method] || tx.payment_method}</td>
                      <td className={`amount-${tx.type}`} style={{ whiteSpace: 'nowrap' }}>
                        {tx.type === 'income' ? '+' : '-'}{FMT(tx.amount)}
                        {(tx.tax_amount > 0 || tx.discount > 0) && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Net: {FMT(tx.amount + tx.tax_amount - tx.discount)}</div>
                        )}
                      </td>
                      <td><span className={`badge badge-${tx.status}`}>{tx.status}</span></td>
                      <td>
                        {tx.attachment_path
                          ? <a href={`/api/uploads/${tx.attachment_path}`} target="_blank" rel="noreferrer" className="attachment-link" title={tx.attachment_name}>
                              <i className={`fa ${fileIcon(tx.attachment_type)}`} /> View
                            </a>
                          : <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-ghost btn-xs" title="View Details" onClick={() => setModal({ type: 'detail', tx })}>
                            <i className="fa fa-eye" />
                          </button>
                          <button className="btn btn-ghost btn-xs" title="Edit" onClick={() => setModal({ type: 'edit', tx })}>
                            <i className="fa fa-pen" />
                          </button>
                          <button className="btn btn-danger btn-xs" title="Delete" onClick={() => setDeleteConfirm(tx)}>
                            <i className="fa fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="hist-pagination">
              <div className="hist-page-info">
                Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total}
              </div>
              <div className="hist-page-controls">
                <button className="hist-page-btn" onClick={() => setPage(1)} disabled={page === 1}><i className="fa fa-angles-left" /></button>
                <button className="hist-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page === 1}><i className="fa fa-angle-left" /></button>
                {pageNumbers().map((n) => (
                  <button key={n} className={`hist-page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button className="hist-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page === pages}><i className="fa fa-angle-right" /></button>
                <button className="hist-page-btn" onClick={() => setPage(pages)} disabled={page === pages}><i className="fa fa-angles-right" /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {modal?.type === 'detail' && (
        <Modal title="Transaction Details" onClose={() => setModal(null)} size="lg"
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
            <button className="btn btn-primary" onClick={() => setModal({ type: 'edit', tx: modal.tx })}>
              <i className="fa fa-pen" /> Edit
            </button>
          </>}
        >
          <DetailView tx={modal.tx} />
        </Modal>
      )}

      {/* Edit Modal */}
      {modal?.type === 'edit' && (
        <Modal title="Edit Transaction" onClose={() => setModal(null)} size="xl">
          <AddTransaction
            editData={modal.tx}
            onSaved={() => { setModal(null); showToast('Updated!'); load(); }}
          />
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────── */}
      {deleteConfirm && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteConfirm(null); }}
        >
          <div className="modal-box" style={{ maxWidth: 420 }}>
            {/* Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: '#fee2e2', color: '#dc2626',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.05rem', flexShrink: 0,
                }}>
                  <i className="fa fa-triangle-exclamation" />
                </div>
                <span className="modal-title">Delete Transaction</span>
              </div>
              <button className="modal-close" onClick={() => !deleting && setDeleteConfirm(null)} disabled={deleting}>
                <i className="fa fa-xmark" />
              </button>
            </div>

            {/* Body */}
            <div className="modal-body">
              {/* Transaction preview */}
              <div style={{
                background: deleteConfirm.type === 'income' ? '#f0fdf4' : '#fef2f2',
                borderLeft: `4px solid ${deleteConfirm.type === 'income' ? '#22c55e' : '#ef4444'}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              }}>
                <div style={{ fontWeight: 700, color: '#111', fontSize: '0.95rem' }}>{deleteConfirm.title}</div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 4 }}>
                  {deleteConfirm.date} &nbsp;·&nbsp;
                  <span className={`amount-${deleteConfirm.type}`}>
                    {deleteConfirm.type === 'income' ? '+' : '-'}{' '}
                    {'₹' + Number(deleteConfirm.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  {deleteConfirm.project_name && <> &nbsp;·&nbsp; {deleteConfirm.project_name}</>}
                </div>
              </div>

              <p style={{ color: '#333', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: 8 }}>
                Are you sure you want to permanently delete this transaction?
              </p>
              <p style={{ color: '#999', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fa fa-circle-info" />
                This action cannot be undone. Any attached proof files will also be removed.
              </p>
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting
                  ? <><i className="fa fa-spinner fa-spin" /> Deleting…</>
                  : <><i className="fa fa-trash" /> Yes, Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailView({ tx }) {
  const fields = [
    ['Date', tx.date],
    ['Type', <span className={`badge badge-${tx.type}`}>{tx.type}</span>],
    ['Project', tx.project_name || '—'],
    ['Category', tx.category_name || '—'],
    ['Amount', <span className={`amount-${tx.type}`}>{FMT(tx.amount)}</span>],
    ['Tax Amount', tx.tax_amount > 0 ? FMT(tx.tax_amount) : '—'],
    ['Discount', tx.discount > 0 ? FMT(tx.discount) : '—'],
    ['Net Amount', <strong>{FMT(tx.amount + tx.tax_amount - tx.discount)}</strong>],
    ['Reference No.', tx.reference_no || '—'],
    ['Payment Method', PAYMENT_LABELS[tx.payment_method] || tx.payment_method],
    [tx.type === 'income' ? 'Client / Payer' : 'Vendor / Payee', tx.party_name || '—'],
    ['Status', <span className={`badge badge-${tx.status}`}>{tx.status}</span>],
    ['Created At', tx.created_at],
    ['Last Updated', tx.updated_at],
  ];

  return (
    <div>
      <div style={{ background: tx.type === 'income' ? '#f0fdf4' : '#fef2f2', borderRadius: 10, padding: '14px 18px', marginBottom: 20, borderLeft: `4px solid ${tx.type === 'income' ? '#22c55e' : '#ef4444'}` }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{tx.title}</div>
        {tx.description && <div style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 4 }}>{tx.description}</div>}
      </div>
      <div className="detail-grid">
        {fields.map(([label, val]) => (
          <div key={label} className="detail-item">
            <div className="dl">{label}</div>
            <div className="dv">{val}</div>
          </div>
        ))}
      </div>
      {tx.notes && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 8 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: '0.88rem', color: '#475569' }}>{tx.notes}</div>
        </div>
      )}
      {tx.attachment_path && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
            <i className="fa fa-paperclip" /> Attached Proof
          </div>
          {tx.attachment_type?.startsWith('image/') ? (
            <div>
              <img src={`/api/uploads/${tx.attachment_path}`} alt={tx.attachment_name} style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <div style={{ marginTop: 6 }}>
                <a href={`/api/uploads/${tx.attachment_path}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><i className="fa fa-download" /> Download</a>
              </div>
            </div>
          ) : (
            <div className="file-preview">
              <i className="fa fa-file-pdf" style={{ color: '#ef4444', fontSize: '1.8rem' }} />
              <div className="file-info">
                <div className="file-name">{tx.attachment_name}</div>
              </div>
              <a href={`/api/uploads/${tx.attachment_path}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                <i className="fa fa-eye" /> Open File
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
