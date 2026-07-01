import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { ToastContext } from '../App';
import { companiesApi, accountingReportsApi, vouchersApi, getActiveCompany, setActiveCompany } from '../api';
import CompanySwitcher from '../components/CompanySwitcher';
import './FinancialReports.css';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtAmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

async function downloadBlob(url, filename) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Export failed');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const TABS = [
  { key: 'trial-balance', label: 'Trial Balance', icon: 'fa-scale-balanced' },
  { key: 'profit-loss',   label: 'Profit & Loss',  icon: 'fa-chart-line' },
  { key: 'balance-sheet', label: 'Balance Sheet',  icon: 'fa-file-invoice' },
  { key: 'daybook',       label: 'Day Book',       icon: 'fa-calendar-day' },
];

export default function FinancialReports() {
  const showToast = useContext(ToastContext);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(getActiveCompany());
  const [tab, setTab] = useState('trial-balance');

  const [asOf, setAsOf]   = useState(todayStr());
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState(todayStr());

  const [tbData, setTbData] = useState(null);
  const [plData, setPlData] = useState(null);
  const [bsData, setBsData] = useState(null);
  const [dbData, setDbData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null);

  const loadCompanies = useCallback(async () => {
    try {
      const d = await companiesApi.list();
      setCompanies(d || []);
      if (!companyId && d && d.length) { setCompanyId(d[0].id); setActiveCompany(d[0].id); }
    } catch { /* ignore */ }
  }, [companyId]);

  useEffect(() => { loadCompanies(); }, []); // eslint-disable-line
  useEffect(() => {
    const onChange = (e) => setCompanyId(e.detail);
    window.addEventListener('wbm-company-change', onChange);
    return () => window.removeEventListener('wbm-company-change', onChange);
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      if (tab === 'trial-balance') setTbData(await accountingReportsApi.trialBalance({ company_id: companyId, as_of: asOf }));
      else if (tab === 'profit-loss') setPlData(await accountingReportsApi.profitLoss({ company_id: companyId, from, to }));
      else if (tab === 'balance-sheet') setBsData(await accountingReportsApi.balanceSheet({ company_id: companyId, as_of: asOf }));
      else if (tab === 'daybook') setDbData(await vouchersApi.daybook({ company_id: companyId, from: from || undefined, to }));
    } catch { showToast('Failed to load report', 'error'); }
    finally { setLoading(false); }
  }, [companyId, tab, asOf, from, to]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const doExport = async (fmt) => {
    setExporting(fmt);
    try {
      const params = tab === 'profit-loss' ? { company_id: companyId, from, to } : { company_id: companyId, as_of: asOf };
      const urlFn = tab === 'trial-balance' ? accountingReportsApi.trialBalanceExportUrl
        : tab === 'profit-loss' ? accountingReportsApi.profitLossExportUrl
        : accountingReportsApi.balanceSheetExportUrl;
      const ext = fmt === 'pdf' ? 'pdf' : 'xlsx';
      await downloadBlob(urlFn(params, fmt), `${tab}-${todayStr()}.${ext}`);
      showToast(`${fmt.toUpperCase()} exported`, 'success');
    } catch { showToast('Export failed', 'error'); }
    finally { setExporting(null); }
  };

  const daybookGrouped = useMemo(() => {
    if (!dbData) return [];
    const map = {};
    dbData.forEach((r) => { (map[r.voucher_id] = map[r.voucher_id] || { ...r, lines: [] }).lines.push(r); });
    return Object.values(map);
  }, [dbData]);

  return (
    <div className="fr-page">
      <div className="fr-header">
        <div className="fr-header-left">
          <h1><i className="fa fa-chart-pie" /> Financial Reports</h1>
          <p>Trial Balance, Profit &amp; Loss, Balance Sheet and Day Book — derived live from your posted vouchers.</p>
        </div>
        <CompanySwitcher companies={companies} companyId={companyId}
          onChange={(id) => { setCompanyId(id); setActiveCompany(id); }}
          onCreated={loadCompanies} showToast={showToast} />
      </div>

      <div className="fr-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`fr-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            <i className={`fa ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      <div className="fr-toolbar">
        {(tab === 'trial-balance' || tab === 'balance-sheet') && (
          <div className="fr-date-field"><label>As of</label><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        )}
        {(tab === 'profit-loss' || tab === 'daybook') && (
          <>
            <div className="fr-date-field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="fr-date-field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
        {tab !== 'daybook' && (
          <div className="fr-export-grp">
            <button onClick={() => doExport('excel')} disabled={!!exporting}>{exporting === 'excel' ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-file-excel" />} Excel</button>
            <button onClick={() => doExport('pdf')} disabled={!!exporting}>{exporting === 'pdf' ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-file-pdf" />} PDF</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="fr-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>
      ) : (
        <div className="fr-body">
          {tab === 'trial-balance' && tbData && (
            <div className={`fr-card${Math.abs(tbData.difference) < 0.01 ? ' balanced' : ''}`}>
              <table className="fr-table">
                <thead><tr><th>Ledger Account</th><th>Group</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                <tbody>
                  {tbData.rows.map((r) => (
                    <tr key={r.id}><td>{r.name}</td><td className="fr-muted">{r.group_name}</td>
                      <td className="num">{r.debit ? fmtAmt(r.debit) : '—'}</td>
                      <td className="num">{r.credit ? fmtAmt(r.credit) : '—'}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2}>TOTAL</td><td className="num">{fmtAmt(tbData.dr_total)}</td><td className="num">{fmtAmt(tbData.cr_total)}</td></tr></tfoot>
              </table>
              <div className="fr-check-strip">
                {Math.abs(tbData.difference) < 0.01
                  ? <span className="ok"><i className="fa fa-circle-check" /> Trial Balance is tallied</span>
                  : <span className="bad"><i className="fa fa-triangle-exclamation" /> Out of balance by {fmtAmt(Math.abs(tbData.difference))}</span>}
              </div>
            </div>
          )}

          {tab === 'profit-loss' && plData && (
            <div className="fr-card">
              <div className="fr-pl-cols">
                <div>
                  <div className="fr-pl-hdr income">Income</div>
                  <table className="fr-table"><tbody>
                    {plData.income.map((a) => <tr key={a.id}><td>{a.name}</td><td className="num">{fmtAmt(a.amount)}</td></tr>)}
                    {plData.income.length === 0 && <tr><td className="fr-muted">No income recorded</td><td /></tr>}
                  </tbody><tfoot><tr><td>Total Income</td><td className="num">{fmtAmt(plData.income_total)}</td></tr></tfoot></table>
                </div>
                <div>
                  <div className="fr-pl-hdr expense">Expense</div>
                  <table className="fr-table"><tbody>
                    {plData.expense.map((a) => <tr key={a.id}><td>{a.name}</td><td className="num">{fmtAmt(a.amount)}</td></tr>)}
                    {plData.expense.length === 0 && <tr><td className="fr-muted">No expense recorded</td><td /></tr>}
                  </tbody><tfoot><tr><td>Total Expense</td><td className="num">{fmtAmt(plData.expense_total)}</td></tr></tfoot></table>
                </div>
              </div>
              <div className={`fr-net-strip${plData.net_profit >= 0 ? ' pos' : ' neg'}`}>
                <span>Net {plData.net_profit >= 0 ? 'Profit' : 'Loss'}</span>
                <strong>{fmtAmt(Math.abs(plData.net_profit))}</strong>
              </div>
            </div>
          )}

          {tab === 'balance-sheet' && bsData && (
            <div className={`fr-card${Math.abs(bsData.difference) < 0.01 ? ' balanced' : ''}`}>
              <div className="fr-pl-cols">
                <div>
                  <div className="fr-pl-hdr asset">Assets</div>
                  <table className="fr-table"><tbody>
                    {bsData.assets.map((a) => <tr key={a.id}><td>{a.name}<div className="fr-muted-sm">{a.group_name}</div></td><td className="num">{fmtAmt(a.amount)}</td></tr>)}
                  </tbody><tfoot><tr><td>Total Assets</td><td className="num">{fmtAmt(bsData.assets_total)}</td></tr></tfoot></table>
                </div>
                <div>
                  <div className="fr-pl-hdr liability">Liabilities</div>
                  <table className="fr-table"><tbody>
                    {bsData.liabilities.map((a) => <tr key={a.id}><td>{a.name}<div className="fr-muted-sm">{a.group_name}</div></td><td className="num">{fmtAmt(a.amount)}</td></tr>)}
                    {bsData.liabilities.length === 0 && <tr><td className="fr-muted">None</td><td /></tr>}
                  </tbody><tfoot><tr><td>Total Liabilities</td><td className="num">{fmtAmt(bsData.liabilities_total)}</td></tr></tfoot></table>

                  <div className="fr-pl-hdr capital">Capital</div>
                  <table className="fr-table"><tbody>
                    {bsData.capital.map((a) => <tr key={a.id}><td>{a.name}<div className="fr-muted-sm">{a.group_name}</div></td><td className="num">{fmtAmt(a.amount)}</td></tr>)}
                    <tr><td>Profit &amp; Loss A/c (current)</td><td className="num">{fmtAmt(bsData.net_profit)}</td></tr>
                  </tbody><tfoot><tr><td>Total Capital</td><td className="num">{fmtAmt(bsData.capital_total)}</td></tr></tfoot></table>
                </div>
              </div>
              <div className="fr-check-strip">
                {Math.abs(bsData.difference) < 0.01
                  ? <span className="ok"><i className="fa fa-circle-check" /> Balance Sheet is tallied (Assets = Liabilities + Capital)</span>
                  : <span className="bad"><i className="fa fa-triangle-exclamation" /> Out of balance by {fmtAmt(Math.abs(bsData.difference))}</span>}
              </div>
            </div>
          )}

          {tab === 'daybook' && (
            <div className="fr-card">
              {daybookGrouped.length === 0 ? (
                <div className="fr-empty">No vouchers posted in this period.</div>
              ) : daybookGrouped.map((v) => (
                <div key={v.voucher_id} className="fr-db-voucher">
                  <div className="fr-db-hdr">
                    <span className="fr-db-type">{v.voucher_type}</span>
                    <span className="fr-db-no">#{v.voucher_no}</span>
                    <span className="fr-db-date">{fmtDate(v.voucher_date)}</span>
                    {v.narration && <span className="fr-db-narr">{v.narration}</span>}
                  </div>
                  <table className="fr-table"><tbody>
                    {v.lines.map((l, i) => (
                      <tr key={i}><td>{l.ledger_name}</td>
                        <td className="num">{l.dr_cr === 'debit' ? fmtAmt(l.amount) : '—'}</td>
                        <td className="num">{l.dr_cr === 'credit' ? fmtAmt(l.amount) : '—'}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
