import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { transactionsApi, projectsApi, categoriesApi } from '../api';
import Modal from '../components/Modal';
import AddTransaction from './AddTransaction';
import { ToastContext } from '../App';

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
  const location = useLocation();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);

  const [filters, setFilters] = useState({
    type: '', project_id: '', category_id: '', status: '',
    payment_method: '', date_from: '', date_to: '', search: '',
  });

  const [modal, setModal] = useState(null); // null | {type:'detail'|'edit', tx}
  const LIMIT = 15;

  useEffect(() => {
    projectsApi.list().done(setProjects);
    categoriesApi.list().done(setCategories);
    // Read ?status=pending from URL
    const params = new URLSearchParams(location.search);
    if (params.get('status')) setFilters((f) => ({ ...f, status: params.get('status') }));
  }, [location.search]);

  const load = useCallback(() => {
    setLoading(true);
    const params = { ...filters, page, limit: LIMIT };
    Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });

    transactionsApi.list(params)
      .done((res) => {
        setTransactions(res.data);
        setTotal(res.total);
        setPages(res.pages);
      })
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

  const handleDelete = (tx) => {
    if (!window.confirm(`Delete "${tx.title}"? This cannot be undone.`)) return;
    transactionsApi.remove(tx.id)
      .done(() => { showToast('Transaction deleted'); load(); })
      .fail(() => showToast('Delete failed', 'error'));
  };

  const filteredCats = categories.filter((c) => !filters.type || c.type === filters.type);
  const hasFilters = Object.values(filters).some(Boolean);

  const pageNumbers = () => {
    const p = [];
    const range = 2;
    for (let i = Math.max(1, page - range); i <= Math.min(pages, page + range); i++) p.push(i);
    return p;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transaction History <span>{total} records</span></h1>
        <button className="btn btn-primary" onClick={() => navigate('/add-transaction')}>
          <i className="fa fa-plus" /> Add Transaction
        </button>
      </div>

      {/* Summary Bar */}
      <div className="summary-bar">
        <div className="s-item"><span className="s-label">Income</span><span className="s-val s-income">+{filters.type !== 'expense' ? FMT(summary.total_income) : '—'}</span></div>
        <div className="s-item"><span className="s-label">Expense</span><span className="s-val s-expense">-{filters.type !== 'income' ? FMT(summary.total_expense) : '—'}</span></div>
        <div className="s-item">
          <span className="s-label">Net Balance</span>
          <span className={`s-val ${summary.net >= 0 ? 's-net-pos' : 's-net-neg'}`}>{FMT(summary.net)}</span>
        </div>
        <div className="s-item"><span className="s-label">Records</span><span className="s-val" style={{ color: '#475569' }}>{summary.count || 0}</span></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 18, padding: '16px 20px' }}>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <input className="form-control wide" placeholder="Search title, party, reference..." value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
          <select className="form-control" value={filters.type} onChange={(e) => { setFilter('type', e.target.value); setFilter('category_id', ''); }}>
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select className="form-control" value={filters.project_id} onChange={(e) => setFilter('project_id', e.target.value)}>
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-control" value={filters.category_id} onChange={(e) => setFilter('category_id', e.target.value)}>
            <option value="">All Categories</option>
            {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-control" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="form-control" value={filters.payment_method} onChange={(e) => setFilter('payment_method', e.target.value)}>
            <option value="">All Payment Methods</option>
            {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" className="form-control" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} title="From date" />
          <input type="date" className="form-control" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} title="To date" />
          {hasFilters && <button className="btn btn-ghost btn-sm" onClick={clearFilters}><i className="fa fa-xmark" /> Clear</button>}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-spinner"><i className="fa fa-spinner fa-spin" /> Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state"><i className="fa fa-inbox" /><p>No transactions found{hasFilters ? ' for the selected filters' : '. Add your first transaction.'}.</p></div>
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
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            Net: {FMT(tx.amount + tx.tax_amount - tx.discount)}
                          </div>
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
                          <button className="btn btn-danger btn-xs" title="Delete" onClick={() => handleDelete(tx)}>
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
            <div className="pagination" style={{ padding: '14px 20px' }}>
              <div className="pagination-info">Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total}</div>
              <div className="pagination-controls">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}><i className="fa fa-angles-left" /></button>
                <button className="page-btn" onClick={() => setPage((p) => p - 1)} disabled={page === 1}><i className="fa fa-angle-left" /></button>
                {pageNumbers().map((n) => (
                  <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button className="page-btn" onClick={() => setPage((p) => p + 1)} disabled={page === pages}><i className="fa fa-angle-right" /></button>
                <button className="page-btn" onClick={() => setPage(pages)} disabled={page === pages}><i className="fa fa-angles-right" /></button>
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

