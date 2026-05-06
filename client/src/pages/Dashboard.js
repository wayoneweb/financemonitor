import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { dashboardApi } from '../api';
import './Dashboard.css';

const FMT = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMTK = (n) => {
  n = Number(n || 0);
  if (n >= 10_000_000) return '₹' + (n / 10_000_000).toFixed(1) + 'Cr';
  if (n >= 100_000)    return '₹' + (n / 100_000).toFixed(1) + 'L';
  if (n >= 1_000)      return '₹' + (n / 1_000).toFixed(1) + 'k';
  return '₹' + n.toFixed(0);
};

const PIE_COLORS = ['#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#84cc16','#64748b'];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const nowStr = () => new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: 'none', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, fontSize: '0.82rem', fontWeight: 700 }}>
          {p.name}: {FMT(p.value)}
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardApi.stats()
      .done(setData)
      .fail(() => {})
      .always(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 14 }}>
      <div style={{ width: 48, height: 48, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#94a3b8', fontWeight: 500 }}>Loading dashboard…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const overall      = data?.overall || {};
  const net          = (overall.total_income || 0) - (overall.total_expense || 0);
  const netPos       = net >= 0;
  const lossProjects = data?.loss_projects || [];
  const totalLoss    = lossProjects.reduce((sum, p) => sum + Math.abs(p.net), 0);

  const upSnap        = data?.upcoming_snap || {};
  const dailyProjects = data?.daily_projects || [];

  // Items due exactly tomorrow
  const tomorrowItems = (data?.upcoming7 || []).filter((u) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(u.due_date); d.setHours(0,0,0,0);
    return Math.round((d - today) / 86400000) === 1 && u.status !== 'paid';
  });

  const monthlyData = (data?.monthly || []).map((m) => ({
    month: m.month ? m.month.slice(5) + '/' + m.month.slice(0, 4) : '',
    Income: parseFloat(m.income || 0),
    Expense: parseFloat(m.expense || 0),
  }));

  const expenseCats = (data?.by_category || []).filter((c) => c.type === 'expense').slice(0, 8);
  const projectData = (data?.by_project || []).map((p) => ({
    name: p.name.length > 16 ? p.name.slice(0, 16) + '…' : p.name,
    Income: parseFloat(p.income || 0),
    Expense: parseFloat(p.expense || 0),
  }));

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="db-hero">
        <div className="db-hero-top">
          <div>
            <div className="db-hero-greeting">{greeting()}</div>
            <div className="db-hero-title">Finance Overview</div>
            <div className="db-hero-date"><i className="fa fa-calendar-days" style={{ marginRight: 5 }} />{nowStr()}</div>
          </div>
          <div className="db-hero-actions">
            <button className="btn-hero-primary" onClick={() => navigate('/history')}>
              <i className="fa fa-clock-rotate-left" /> History
            </button>
            <button className="btn-hero-solid" onClick={() => navigate('/add-transaction')}>
              <i className="fa fa-plus" /> Add Transaction
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-income">
          <div className="kpi-icon-wrap"><i className="fa fa-arrow-trend-up" /></div>
          <div className="kpi-label">Total Income</div>
          <div className="kpi-value">{FMT(overall.total_income)}</div>
          <div className="kpi-sub"><span className="kpi-dot" />{overall.total_transactions || 0} total transactions</div>
        </div>

        <div className="kpi-card kpi-expense">
          <div className="kpi-icon-wrap"><i className="fa fa-arrow-trend-down" /></div>
          <div className="kpi-label">Total Expense</div>
          <div className="kpi-value">{FMT(overall.total_expense)}</div>
          <div className="kpi-sub"><span className="kpi-dot" />{data?.projects?.total || 0} projects tracked</div>
        </div>

        <div className={`kpi-card ${netPos ? 'kpi-balance-pos' : 'kpi-balance-neg'}`}>
          <div className="kpi-icon-wrap"><i className="fa fa-scale-balanced" /></div>
          <div className="kpi-label">Net Balance</div>
          <div className="kpi-value">{FMT(Math.abs(net))}</div>
          <div className="kpi-sub">
            <span className="kpi-dot" />
            {netPos ? 'Profit — performing well' : 'Deficit — expenses exceed income'}
          </div>
        </div>

        {/* Loss KPI */}
        <div className={`kpi-card kpi-loss ${lossProjects.length > 0 ? 'kpi-loss-active' : 'kpi-loss-clear'}`}>
          <div className="kpi-icon-wrap">
            <i className={`fa ${lossProjects.length > 0 ? 'fa-triangle-exclamation' : 'fa-shield-halved'}`} />
          </div>
          <div className="kpi-label">Total Loss</div>
          <div className="kpi-value">{FMT(totalLoss)}</div>
          <div className="kpi-sub">
            <span className="kpi-dot" />
            {lossProjects.length > 0
              ? `${lossProjects.length} project${lossProjects.length > 1 ? 's' : ''} in loss`
              : 'All projects profitable'}
          </div>
        </div>

        <div className="kpi-card kpi-projects">
          <div className="kpi-icon-wrap"><i className="fa fa-folder-open" /></div>
          <div className="kpi-label">Projects</div>
          <div className="kpi-value">{data?.projects?.total || 0}</div>
          <div className="kpi-sub"><span className="kpi-dot" />{data?.projects?.active || 0} active right now</div>
        </div>
      </div>

      {/* ── Loss Alert Section ─────────────────────────────────── */}
      {lossProjects.length > 0 && (
        <div className="db-card loss-alert-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon loss-title-icon">
                <i className="fa fa-triangle-exclamation" />
              </div>
              Loss Alert — Project-wise Breakdown
            </div>
            <span className="loss-badge-count">
              {lossProjects.length} project{lossProjects.length > 1 ? 's' : ''} losing money
            </span>
          </div>

          <div className="loss-projects-grid">
            {lossProjects.map((p) => {
              const lossAmt  = Math.abs(p.net);
              const lossPct  = p.expense > 0 ? ((lossAmt / p.expense) * 100).toFixed(1) : 0;
              const barWidth = p.income > 0 ? Math.min((p.income / p.expense) * 100, 100) : 0;
              return (
                <div key={p.id} className="loss-project-card">
                  <div className="lpc-header">
                    <div className="lpc-name">
                      <i className="fa fa-folder-open" style={{ color: '#ef4444', marginRight: 7 }} />
                      {p.name}
                    </div>
                    <span className="lpc-loss-badge">
                      <i className="fa fa-arrow-down" /> -{FMT(lossAmt)}
                    </span>
                  </div>

                  <div className="lpc-bar-wrap">
                    <div className="lpc-bar-track">
                      <div className="lpc-bar-income" style={{ width: barWidth + '%' }} />
                    </div>
                    <span className="lpc-bar-pct">{lossPct}% over budget</span>
                  </div>

                  <div className="lpc-stats">
                    <div className="lpc-stat">
                      <span className="lpc-stat-label">Income</span>
                      <span className="lpc-stat-val lpc-inc">{FMT(p.income)}</span>
                    </div>
                    <div className="lpc-stat">
                      <span className="lpc-stat-label">Expense</span>
                      <span className="lpc-stat-val lpc-exp">{FMT(p.expense)}</span>
                    </div>
                    <div className="lpc-stat">
                      <span className="lpc-stat-label">Net Loss</span>
                      <span className="lpc-stat-val lpc-loss">-{FMT(lossAmt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="loss-total-row">
            <span className="loss-total-label">
              <i className="fa fa-sigma" /> Combined Loss Across All Projects
            </span>
            <span className="loss-total-val">-{FMT(totalLoss)}</span>
          </div>
        </div>
      )}

      {/* ── Upcoming + Daily Row ─────────────────────────────── */}
      <div className="db-charts-row">

        {/* Upcoming Income vs Expense Comparison */}
        <div className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                <i className="fa fa-calendar-days" />
              </div>
              Upcoming (Next 30 Days)
            </div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 700 }}
              onClick={() => navigate('/upcoming')}>
              Manage <i className="fa fa-arrow-right" />
            </button>
          </div>

          {/* Due Tomorrow alert */}
          {tomorrowItems.length > 0 && (
            <div className="dash-tomorrow-alert">
              <span className="dash-tomorrow-bell"><i className="fa fa-bell" /></span>
              <div>
                <div className="dash-tomorrow-title">Due Tomorrow!</div>
                <div className="dash-tomorrow-list">
                  {tomorrowItems.map((u) => (
                    <span key={u.id} className={`dash-tomorrow-pill ${u.type}`}>
                      {u.title} — {FMT(u.amount)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Overdue alert */}
          {upSnap.overdue_count > 0 && (
            <div className="upc-dash-overdue">
              <i className="fa fa-triangle-exclamation" />
              <span><strong>{upSnap.overdue_count}</strong> overdue item{upSnap.overdue_count > 1 ? 's' : ''} — {FMT(upSnap.overdue_amount)} unpaid</span>
            </div>
          )}

          <div className="upc-dash-compare">
            {/* Income bar */}
            <div className="upc-dash-row">
              <div className="upc-dash-label">
                <span className="upc-dash-dot income" />
                <span>Incoming</span>
              </div>
              <div className="upc-dash-bar-wrap">
                <div className="upc-dash-bar income"
                  style={{ width: Math.max((upSnap.upcoming_income / (Math.max(upSnap.upcoming_income, upSnap.upcoming_expense) || 1)) * 100, 2) + '%' }} />
              </div>
              <span className="upc-dash-amt income">+{FMT(upSnap.upcoming_income)}</span>
            </div>
            {/* Expense bar */}
            <div className="upc-dash-row">
              <div className="upc-dash-label">
                <span className="upc-dash-dot expense" />
                <span>Outgoing</span>
              </div>
              <div className="upc-dash-bar-wrap">
                <div className="upc-dash-bar expense"
                  style={{ width: Math.max((upSnap.upcoming_expense / (Math.max(upSnap.upcoming_income, upSnap.upcoming_expense) || 1)) * 100, 2) + '%' }} />
              </div>
              <span className="upc-dash-amt expense">-{FMT(upSnap.upcoming_expense)}</span>
            </div>

            {/* Net */}
            <div className="upc-dash-net">
              <span>Projected Net</span>
              <span className={upSnap.upcoming_income >= upSnap.upcoming_expense ? 'amount-income' : 'amount-expense'}>
                {upSnap.upcoming_income >= upSnap.upcoming_expense ? '+' : '-'}
                {FMT(Math.abs((upSnap.upcoming_income || 0) - (upSnap.upcoming_expense || 0)))}
              </span>
            </div>
          </div>
        </div>

        {/* Daily Project Monitoring */}
        <div className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                <i className="fa fa-calendar-day" />
              </div>
              Today's Activity
            </div>
            <span className="db-card-badge">{new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
          </div>

          {dailyProjects.length === 0 ? (
            <NoData icon="fa-sun" text="No transactions recorded today" />
          ) : (
            <div className="daily-project-list">
              {dailyProjects.map((p) => {
                const net = p.today_income - p.today_expense;
                const maxAmt = Math.max(p.today_income, p.today_expense) || 1;
                return (
                  <div key={p.id} className="daily-proj-row">
                    <div className="daily-proj-name">
                      <i className="fa fa-folder" style={{ color: '#6366f1', marginRight: 6 }} />
                      {p.name.length > 18 ? p.name.slice(0,18)+'…' : p.name}
                    </div>
                    <div className="daily-proj-bars">
                      <div className="daily-bar-row">
                        <div className="daily-bar inc" style={{ width: (p.today_income / maxAmt * 100) + '%' }} />
                        <span className="daily-bar-val inc">{FMT(p.today_income)}</span>
                      </div>
                      <div className="daily-bar-row">
                        <div className="daily-bar exp" style={{ width: (p.today_expense / maxAmt * 100) + '%' }} />
                        <span className="daily-bar-val exp">{FMT(p.today_expense)}</span>
                      </div>
                    </div>
                    <div className={`daily-proj-net ${net >= 0 ? 'pos' : 'neg'}`}>
                      {net >= 0 ? '+' : '-'}{FMT(Math.abs(net))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Charts Row ────────────────────────────────────────── */}
      <div className="db-charts-row">
        {/* Area Chart — Monthly Trend */}
        <div className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><i className="fa fa-chart-area" /></div>
              Monthly Income vs Expense
            </div>
            <span className="db-card-badge">Last 12 months</span>
          </div>
          {monthlyData.length === 0 ? (
            <NoData icon="fa-chart-line" text="No monthly data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => FMTK(v)} width={42} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2.5} fill="url(#incGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="Expense" stroke="#ef4444" strokeWidth={2.5} fill="url(#expGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut + Legend — Expense by Category */}
        <div className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon" style={{ background: '#fef2f2', color: '#ef4444' }}><i className="fa fa-chart-pie" /></div>
              Expenses by Category
            </div>
          </div>
          {expenseCats.length === 0 ? (
            <NoData icon="fa-chart-pie" text="No expense data yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={expenseCats} dataKey="total" nameKey="name" cx="50%" cy="50%"
                    innerRadius={45} outerRadius={72}
                    paddingAngle={3} strokeWidth={0}>
                    {expenseCats.map((c, i) => <Cell key={i} fill={c.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => FMT(v)} content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {expenseCats.map((c, i) => (
                  <div key={i} className="pie-legend-item">
                    <div className="pie-legend-left">
                      <div className="pie-dot" style={{ background: c.color || PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="pie-name">{c.name}</span>
                    </div>
                    <span className="pie-amount">{FMT(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row ─────────────────────────────────────────── */}
      <div className="db-bottom-row">
        {/* Project performance */}
        <div className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}><i className="fa fa-folder-open" /></div>
              Project Performance
            </div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 700 }} onClick={() => navigate('/projects')}>
              View All <i className="fa fa-arrow-right" />
            </button>
          </div>
          {projectData.length === 0 ? (
            <NoData icon="fa-folder-open" text="No projects yet" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={projectData} layout="vertical" barCategoryGap="30%" margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={FMTK} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="Income" fill="#10b981" radius={[0, 6, 6, 0]} />
                <Bar dataKey="Expense" fill="#f43f5e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pending Widget */}
        <div className="db-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="db-card-header">
            <div className="db-card-title">
              <div className="title-icon" style={{ background: '#fefce8', color: '#ca8a04' }}><i className="fa fa-clock" /></div>
              Pending
            </div>
          </div>
          {data?.pending?.count > 0 ? (
            <div className="pending-widget" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="pending-ring">
                <div className="pending-ring-inner">
                  <span className="pending-count">{data.pending.count}</span>
                  <span className="pending-label-sm">items</span>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 4 }}>Awaiting confirmation</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}>
                {FMT(data.pending.amount)}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: 16 }}>Total pending amount</div>
              <button style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                onClick={() => navigate('/history?status=pending')}>
                <i className="fa fa-eye" /> &nbsp;Review Pending
              </button>
            </div>
          ) : (
            <div className="pending-widget" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>All Clear!</div>
              <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No pending transactions</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Transactions ─────────────────────────────────── */}
      <div className="db-card">
        <div className="db-card-header">
          <div className="db-card-title">
            <div className="title-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><i className="fa fa-list-check" /></div>
            Recent Transactions
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 700 }} onClick={() => navigate('/history')}>
            View All <i className="fa fa-arrow-right" />
          </button>
        </div>

        {!data?.recent?.length ? (
          <NoData icon="fa-receipt" text="No transactions recorded yet" />
        ) : (
          <div className="txn-list">
            {data.recent.map((t) => (
              <div key={t.id} className="txn-row">
                <div className={`txn-avatar ${t.type}`}>
                  <i className={`fa fa-${t.type === 'income' ? 'arrow-down' : 'arrow-up'}`} />
                </div>
                <div className="txn-info">
                  <div className="txn-title">{t.title}</div>
                  <div className="txn-meta">
                    {t.project_name && <><i className="fa fa-folder" style={{ marginRight: 4 }} />{t.project_name} &nbsp;·&nbsp; </>}
                    {t.category_name
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.category_color || '#94a3b8', display: 'inline-block' }} />
                          {t.category_name}
                        </span>
                      : null}
                    {' · '}{t.date}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={`txn-amount ${t.type}`}>
                    {t.type === 'income' ? '+' : '-'}{FMT(t.amount)}
                  </span>
                  <span className={`badge badge-${t.status}`} style={{ fontSize: '0.65rem' }}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoData({ icon, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', color: '#cbd5e1', gap: 10 }}>
      <i className={`fa ${icon}`} style={{ fontSize: '2.2rem' }} />
      <p style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>{text}</p>
    </div>
  );
}
