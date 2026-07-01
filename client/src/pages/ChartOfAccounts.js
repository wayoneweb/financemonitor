import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { ToastContext } from '../App';
import { companiesApi, coaApi, getActiveCompany, setActiveCompany } from '../api';
import CompanySwitcher from '../components/CompanySwitcher';
import './ChartOfAccounts.css';

const TYPES = [
  { key: 'asset',     label: 'Assets',      icon: 'fa-building',           color: '#2563eb' },
  { key: 'liability',  label: 'Liabilities', icon: 'fa-hand-holding-dollar', color: '#dc2626' },
  { key: 'income',    label: 'Income',      icon: 'fa-arrow-trend-up',     color: '#059669' },
  { key: 'capital',   label: 'Capital',     icon: 'fa-piggy-bank',         color: '#7c3aed' },
  { key: 'expense',   label: 'Expenses',    icon: 'fa-arrow-trend-down',   color: '#ea580c' },
];

const GROUP_EMPTY  = { name: '', account_type: 'asset', parent_id: '' };
const LEDGER_EMPTY = { name: '', code: '', group_id: '', opening_balance: '', opening_balance_type: 'debit',
  opening_date: '', gstin: '', party_type: '', address: '', phone: '', email: '', notes: '' };

const fmtAmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ChartOfAccounts() {
  const showToast = useContext(ToastContext);

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(getActiveCompany());
  const [groups, setGroups]   = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');
  const [collapsed, setCollapsed] = useState(new Set());

  const [groupModal, setGroupModal] = useState(false);
  const [groupForm,  setGroupForm]  = useState(GROUP_EMPTY);
  const [groupSaving, setGroupSaving] = useState(false);

  const [ledgerModal, setLedgerModal] = useState(false);
  const [editLedger,  setEditLedger]  = useState(null);
  const [ledgerForm,  setLedgerForm]  = useState(LEDGER_EMPTY);
  const [ledgerSaving, setLedgerSaving] = useState(false);

  const [stmtModal,   setStmtModal]   = useState(false);
  const [stmtLedger,  setStmtLedger]  = useState(null);
  const [stmtData,    setStmtData]    = useState(null);
  const [stmtLoading, setStmtLoading] = useState(false);
  const [stmtRange,   setStmtRange]   = useState({ from: '', to: '' });

  const loadCompanies = useCallback(async () => {
    try {
      const d = await companiesApi.list();
      setCompanies(d || []);
      if (!companyId && d && d.length) { setCompanyId(d[0].id); setActiveCompany(d[0].id); }
    } catch { /* ignore */ }
  }, [companyId]);

  const loadCoa = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [g, l] = await Promise.all([coaApi.groups(companyId), coaApi.ledgers(companyId)]);
      setGroups(g || []); setLedgers(l || []);
    } catch { showToast('Failed to load Chart of Accounts', 'error'); }
    finally { setLoading(false); }
  }, [companyId]); // eslint-disable-line

  useEffect(() => { loadCompanies(); }, []); // eslint-disable-line
  useEffect(() => { loadCoa(); }, [loadCoa]);
  useEffect(() => {
    const onChange = (e) => setCompanyId(e.detail);
    window.addEventListener('wbm-company-change', onChange);
    return () => window.removeEventListener('wbm-company-change', onChange);
  }, []);

  const ledgersByGroup = useMemo(() => {
    const map = {};
    ledgers.forEach((l) => { (map[l.group_id] = map[l.group_id] || []).push(l); });
    return map;
  }, [ledgers]);

  const childGroups = useMemo(() => {
    const map = {};
    groups.forEach((g) => { const p = g.parent_id || 'root'; (map[p] = map[p] || []).push(g); });
    return map;
  }, [groups]);

  const q = search.trim().toLowerCase();
  const matches = (l) => !q || l.name.toLowerCase().includes(q) || (l.code || '').toLowerCase().includes(q);

  const toggleCollapse = (id) => setCollapsed((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Group modal ────────────────────────────────────────────
  const openAddGroup = (type, parentId) => { setGroupForm({ ...GROUP_EMPTY, account_type: type, parent_id: parentId || '' }); setGroupModal(true); };
  const saveGroup = async () => {
    if (!groupForm.name.trim()) return showToast('Group name required', 'error');
    setGroupSaving(true);
    try {
      await coaApi.createGroup({ ...groupForm, company_id: companyId, parent_id: groupForm.parent_id || null });
      showToast('Group added', 'success'); setGroupModal(false); loadCoa();
    } catch (e) { showToast(e?.error || 'Failed to save group', 'error'); }
    finally { setGroupSaving(false); }
  };
  const deleteGroup = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try { await coaApi.removeGroup(g.id); showToast('Group deleted', 'success'); loadCoa(); }
    catch (e) { showToast(e?.error || 'Cannot delete this group', 'error'); }
  };

  // ── Ledger modal ───────────────────────────────────────────
  const openAddLedger = (groupId) => { setLedgerForm({ ...LEDGER_EMPTY, group_id: groupId || '' }); setEditLedger(null); setLedgerModal(true); };
  const openEditLedger = (l) => {
    setLedgerForm({ name: l.name, code: l.code || '', group_id: l.group_id, opening_balance: l.opening_balance || '',
      opening_balance_type: l.opening_balance_type || 'debit', opening_date: l.opening_date || '',
      gstin: l.gstin || '', party_type: l.party_type || '', address: l.address || '', phone: l.phone || '', email: l.email || '', notes: l.notes || '' });
    setEditLedger(l); setLedgerModal(true);
  };
  const saveLedger = async () => {
    if (!ledgerForm.name.trim()) return showToast('Ledger name required', 'error');
    if (!ledgerForm.group_id) return showToast('Please choose a group', 'error');
    setLedgerSaving(true);
    try {
      if (editLedger) await coaApi.updateLedger(editLedger.id, ledgerForm);
      else await coaApi.createLedger({ ...ledgerForm, company_id: companyId });
      showToast(editLedger ? 'Ledger updated' : 'Ledger created', 'success');
      setLedgerModal(false); loadCoa();
    } catch (e) { showToast(e?.error || 'Failed to save ledger', 'error'); }
    finally { setLedgerSaving(false); }
  };
  const deleteLedger = async (l) => {
    if (!window.confirm(`Delete ledger "${l.name}"?`)) return;
    try { await coaApi.removeLedger(l.id); showToast('Ledger deleted', 'success'); loadCoa(); }
    catch (e) { showToast(e?.error || 'This ledger has voucher entries and cannot be deleted.', 'error'); }
  };

  // ── Statement modal ────────────────────────────────────────
  const openStatement = async (l) => {
    setStmtLedger(l); setStmtModal(true); setStmtRange({ from: '', to: '' });
    await loadStatement(l.id, {});
  };
  const loadStatement = async (id, range) => {
    setStmtLoading(true);
    try { const d = await coaApi.statement(id, range); setStmtData(d); }
    catch { showToast('Failed to load statement', 'error'); }
    finally { setStmtLoading(false); }
  };

  const renderGroupNode = (g, depth) => {
    const kids = (childGroups[g.id] || []).sort((a, b) => a.sort_order - b.sort_order);
    const rows = (ledgersByGroup[g.id] || []).filter(matches).sort((a, b) => a.name.localeCompare(b.name));
    const isCollapsed = collapsed.has(g.id);
    if (q && rows.length === 0 && kids.length === 0) return null;

    return (
      <div key={g.id} className="coa-group-node" style={{ marginLeft: depth * 18 }}>
        <div className="coa-group-row">
          <button className="coa-collapse-btn" onClick={() => toggleCollapse(g.id)}>
            <i className={`fa ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'}`} />
          </button>
          <span className="coa-group-name">{g.name}</span>
          <span className="coa-group-count">{rows.length}</span>
          {g.is_system ? <span className="coa-system-tag">Default</span> : (
            <button className="coa-icon-btn del" onClick={() => deleteGroup(g)} title="Delete group"><i className="fa fa-trash" /></button>
          )}
          <button className="coa-icon-btn" onClick={() => openAddGroup(g.account_type, g.id)} title="Add sub-group"><i className="fa fa-folder-plus" /></button>
          <button className="coa-icon-btn" onClick={() => openAddLedger(g.id)} title="Add ledger"><i className="fa fa-plus" /></button>
        </div>
        {!isCollapsed && (
          <>
            {rows.map((l) => (
              <div key={l.id} className="coa-ledger-row">
                <i className="fa fa-file-lines coa-ledger-ico" />
                <span className="coa-ledger-name">{l.name}</span>
                {l.code && <span className="coa-ledger-code">{l.code}</span>}
                {l.party_type && <span className="coa-party-tag">{l.party_type}</span>}
                <span className="coa-ledger-ob">
                  {l.opening_balance ? `${fmtAmt(l.opening_balance)} ${l.opening_balance_type === 'debit' ? 'Dr' : 'Cr'}` : '—'}
                </span>
                <div className="coa-ledger-actions">
                  <button className="coa-icon-btn" onClick={() => openStatement(l)} title="View statement"><i className="fa fa-chart-line" /></button>
                  <button className="coa-icon-btn" onClick={() => openEditLedger(l)} title="Edit"><i className="fa fa-pen" /></button>
                  <button className="coa-icon-btn del" onClick={() => deleteLedger(l)} title="Delete"><i className="fa fa-trash" /></button>
                </div>
              </div>
            ))}
            {kids.map((k) => renderGroupNode(k, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="coa-page">
      <div className="coa-header">
        <div className="coa-header-left">
          <h1><i className="fa fa-sitemap" /> Chart of Accounts</h1>
          <p>Groups and ledger accounts for your books, organized under Assets, Liabilities, Income, Capital and Expenses.</p>
        </div>
        <div className="coa-header-right">
          <CompanySwitcher companies={companies} companyId={companyId}
            onChange={(id) => { setCompanyId(id); setActiveCompany(id); }}
            onCreated={loadCompanies} showToast={showToast} />
          <div className="coa-search-wrap">
            <i className="fa fa-magnifying-glass" />
            <input placeholder="Search ledgers…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="coa-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>
      ) : (
        <div className="coa-sections">
          {TYPES.map((t) => {
            const tops = groups.filter((g) => g.account_type === t.key && !g.parent_id).sort((a, b) => a.sort_order - b.sort_order);
            const total = ledgers.filter((l) => l.account_type === t.key).length;
            return (
              <div key={t.key} className="coa-section" style={{ borderTopColor: t.color }}>
                <div className="coa-section-hdr">
                  <div className="coa-section-title" style={{ color: t.color }}>
                    <i className={`fa ${t.icon}`} /> {t.label}
                  </div>
                  <span className="coa-section-count">{total} ledger{total !== 1 ? 's' : ''}</span>
                  <button className="coa-btn-sm" style={{ borderColor: t.color, color: t.color }} onClick={() => openAddGroup(t.key, null)}>
                    <i className="fa fa-plus" /> Group
                  </button>
                </div>
                <div className="coa-section-body">
                  {tops.length === 0 ? <div className="coa-empty-hint">No groups yet.</div> : tops.map((g) => renderGroupNode(g, 0))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Group Modal ─────────────────────────────────── */}
      {groupModal && (
        <div className="coa-overlay" onClick={(e) => e.target === e.currentTarget && setGroupModal(false)}>
          <div className="coa-modal">
            <div className="coa-modal-hdr">
              <div className="coa-modal-title"><i className="fa fa-folder-plus" /> New Group</div>
              <button className="coa-modal-close" onClick={() => setGroupModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="coa-modal-body">
              <div className="coa-field"><label>Group Name *</label>
                <input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="e.g. Office Equipment" />
              </div>
              <div className="coa-field"><label>Account Type</label>
                <select value={groupForm.account_type} onChange={(e) => setGroupForm((f) => ({ ...f, account_type: e.target.value }))}>
                  {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="coa-field"><label>Parent Group (optional)</label>
                <select value={groupForm.parent_id} onChange={(e) => setGroupForm((f) => ({ ...f, parent_id: e.target.value }))}>
                  <option value="">— Top level —</option>
                  {groups.filter((g) => g.account_type === groupForm.account_type).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="coa-modal-footer">
              <button className="coa-btn-cancel" onClick={() => setGroupModal(false)} disabled={groupSaving}>Cancel</button>
              <button className="coa-btn-save" onClick={saveGroup} disabled={groupSaving}>
                {groupSaving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> Create Group</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Ledger Modal ───────────────────────────── */}
      {ledgerModal && (
        <div className="coa-overlay" onClick={(e) => e.target === e.currentTarget && setLedgerModal(false)}>
          <div className="coa-modal coa-modal-lg">
            <div className="coa-modal-hdr">
              <div className="coa-modal-title"><i className="fa fa-file-lines" /> {editLedger ? 'Edit Ledger' : 'New Ledger Account'}</div>
              <button className="coa-modal-close" onClick={() => setLedgerModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="coa-modal-body">
              <div className="coa-field-row">
                <div className="coa-field"><label>Ledger Name *</label>
                  <input value={ledgerForm.name} onChange={(e) => setLedgerForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="e.g. HDFC Bank / Ramesh Traders" />
                </div>
                <div className="coa-field"><label>Code</label>
                  <input value={ledgerForm.code} onChange={(e) => setLedgerForm((f) => ({ ...f, code: e.target.value }))} placeholder="Optional" />
                </div>
              </div>
              <div className="coa-field"><label>Under Group *</label>
                <select value={ledgerForm.group_id} onChange={(e) => setLedgerForm((f) => ({ ...f, group_id: e.target.value }))}>
                  <option value="">Select a group…</option>
                  {TYPES.map((t) => (
                    <optgroup key={t.key} label={t.label}>
                      {groups.filter((g) => g.account_type === t.key).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="coa-field-row">
                <div className="coa-field"><label>Opening Balance (Rs.)</label>
                  <input type="number" value={ledgerForm.opening_balance} onChange={(e) => setLedgerForm((f) => ({ ...f, opening_balance: e.target.value }))} placeholder="0" />
                </div>
                <div className="coa-field"><label>Balance Type</label>
                  <select value={ledgerForm.opening_balance_type} onChange={(e) => setLedgerForm((f) => ({ ...f, opening_balance_type: e.target.value }))}>
                    <option value="debit">Debit</option><option value="credit">Credit</option>
                  </select>
                </div>
                <div className="coa-field"><label>As of Date</label>
                  <input type="date" value={ledgerForm.opening_date} onChange={(e) => setLedgerForm((f) => ({ ...f, opening_date: e.target.value }))} />
                </div>
              </div>
              <div className="coa-field-row">
                <div className="coa-field"><label>Party Type</label>
                  <select value={ledgerForm.party_type} onChange={(e) => setLedgerForm((f) => ({ ...f, party_type: e.target.value }))}>
                    <option value="">Not a party</option><option value="customer">Customer</option><option value="vendor">Vendor</option>
                  </select>
                </div>
                <div className="coa-field"><label>GSTIN</label>
                  <input value={ledgerForm.gstin} onChange={(e) => setLedgerForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="Optional" />
                </div>
              </div>
              {ledgerForm.party_type && (
                <div className="coa-field-row">
                  <div className="coa-field"><label>Phone</label>
                    <input value={ledgerForm.phone} onChange={(e) => setLedgerForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="coa-field"><label>Email</label>
                    <input value={ledgerForm.email} onChange={(e) => setLedgerForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
              )}
              {ledgerForm.party_type && (
                <div className="coa-field"><label>Address</label>
                  <textarea rows={2} value={ledgerForm.address} onChange={(e) => setLedgerForm((f) => ({ ...f, address: e.target.value }))} />
                </div>
              )}
              <div className="coa-field"><label>Notes</label>
                <textarea rows={2} value={ledgerForm.notes} onChange={(e) => setLedgerForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="coa-modal-footer">
              <button className="coa-btn-cancel" onClick={() => setLedgerModal(false)} disabled={ledgerSaving}>Cancel</button>
              <button className="coa-btn-save" onClick={saveLedger} disabled={ledgerSaving}>
                {ledgerSaving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> {editLedger ? 'Save Changes' : 'Create Ledger'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ledger Statement Modal ──────────────────────────── */}
      {stmtModal && stmtLedger && (
        <div className="coa-overlay" onClick={(e) => e.target === e.currentTarget && setStmtModal(false)}>
          <div className="coa-modal coa-modal-lg">
            <div className="coa-modal-hdr">
              <div className="coa-modal-title"><i className="fa fa-chart-line" /> {stmtLedger.name} — Statement</div>
              <button className="coa-modal-close" onClick={() => setStmtModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="coa-modal-body">
              <div className="coa-stmt-filters">
                <input type="date" value={stmtRange.from} onChange={(e) => setStmtRange((r) => ({ ...r, from: e.target.value }))} />
                <span>to</span>
                <input type="date" value={stmtRange.to} onChange={(e) => setStmtRange((r) => ({ ...r, to: e.target.value }))} />
                <button className="coa-btn-sm" onClick={() => loadStatement(stmtLedger.id, stmtRange)}><i className="fa fa-filter" /> Apply</button>
              </div>
              {stmtLoading ? (
                <div className="coa-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>
              ) : stmtData && (
                <>
                  <div className="coa-stmt-summary">
                    <div><span>Opening</span><strong>{fmtAmt(stmtData.opening_balance)}</strong></div>
                    <div><span>Closing</span><strong>{fmtAmt(stmtData.closing_balance)}</strong></div>
                    <div><span>Entries</span><strong>{stmtData.lines.length}</strong></div>
                  </div>
                  <div className="coa-stmt-table-wrap">
                    <table className="coa-stmt-table">
                      <thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
                      <tbody>
                        {stmtData.lines.length === 0 && <tr><td colSpan={6} className="coa-empty-hint">No transactions in this period.</td></tr>}
                        {stmtData.lines.map((l) => (
                          <tr key={l.id}>
                            <td>{l.voucher_date}</td>
                            <td>{l.voucher_type} #{l.voucher_no}</td>
                            <td>{l.line_narration || l.narration || '—'}</td>
                            <td>{l.dr_cr === 'debit' ? fmtAmt(l.amount) : '—'}</td>
                            <td>{l.dr_cr === 'credit' ? fmtAmt(l.amount) : '—'}</td>
                            <td className={l.running_balance >= 0 ? 'coa-bal-pos' : 'coa-bal-neg'}>{fmtAmt(l.running_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
