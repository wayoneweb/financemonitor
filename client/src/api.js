import $ from 'jquery';

const BASE = '/api';

function ajax(opts) {
  return $.ajax({ ...opts, url: BASE + opts.url });
}

export const projectsApi = {
  list: () => ajax({ url: '/projects', method: 'GET' }),
  get: (id) => ajax({ url: `/projects/${id}`, method: 'GET' }),
  create: (data) => ajax({ url: '/projects', method: 'POST', contentType: 'application/json', data: JSON.stringify(data) }),
  update: (id, data) => ajax({ url: `/projects/${id}`, method: 'PUT', contentType: 'application/json', data: JSON.stringify(data) }),
  remove: (id) => ajax({ url: `/projects/${id}`, method: 'DELETE' }),
};

export const categoriesApi = {
  list: (type) => ajax({ url: '/categories' + (type ? `?type=${type}` : ''), method: 'GET' }),
  create: (data) => ajax({ url: '/categories', method: 'POST', contentType: 'application/json', data: JSON.stringify(data) }),
  update: (id, data) => ajax({ url: `/categories/${id}`, method: 'PUT', contentType: 'application/json', data: JSON.stringify(data) }),
  remove: (id) => ajax({ url: `/categories/${id}`, method: 'DELETE' }),
};

export const transactionsApi = {
  list: (params = {}) => ajax({ url: '/transactions', method: 'GET', data: params }),
  summary: (params = {}) => ajax({ url: '/transactions/summary', method: 'GET', data: params }),
  get: (id) => ajax({ url: `/transactions/${id}`, method: 'GET' }),
  create: (formData) => $.ajax({ url: `${BASE}/transactions`, method: 'POST', data: formData, processData: false, contentType: false }),
  update: (id, formData) => $.ajax({ url: `${BASE}/transactions/${id}`, method: 'PUT', data: formData, processData: false, contentType: false }),
  remove: (id) => ajax({ url: `/transactions/${id}`, method: 'DELETE' }),
  removeAttachment: (id) => ajax({ url: `/transactions/${id}/attachment`, method: 'DELETE' }),
};

export const dashboardApi = {
  stats: () => ajax({ url: '/dashboard/stats', method: 'GET' }),
};

export const exportApi = {
  excelUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${BASE}/export/excel${qs ? '?' + qs : ''}`;
  },
  pdfUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${BASE}/export/pdf${qs ? '?' + qs : ''}`;
  },
  templateUrl: () => `${BASE}/export/template`,
};

export const importApi = {
  preview: (formData) => $.ajax({ url: `${BASE}/import/excel?preview=true`, method: 'POST', data: formData, processData: false, contentType: false }),
  confirm: (formData) => $.ajax({ url: `${BASE}/import/excel`, method: 'POST', data: formData, processData: false, contentType: false }),
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('fm_token') || ''}` });

const usersFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { ...authHeader(), ...(opts.headers || {}) } }).then((r) =>
    r.json().then((d) => (r.ok ? d : Promise.reject(d)))
  );

export const usersApi = {
  list:   ()         => usersFetch('/api/users'),
  create: (data)     => usersFetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  update: (id, data) => usersFetch(`/api/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  remove: (id)       => usersFetch(`/api/users/${id}`, { method: 'DELETE' }),
};

const apiFetch = (url, opts = {}) =>
  fetch(url, opts).then((r) =>
    r.json().then((d) => (r.ok ? d : Promise.reject(d)))
  );

export const loansApi = {
  list:     ()         => apiFetch('/api/loans'),
  reminders:()         => apiFetch('/api/loans/reminders'),
  create:   (data)     => apiFetch('/api/loans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  update:   (id, data) => apiFetch(`/api/loans/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  remove:   (id)       => apiFetch(`/api/loans/${id}`, { method: 'DELETE' }),
  payments: (id)       => apiFetch(`/api/loans/${id}/payments`),
  pay:      (id, data) => apiFetch(`/api/loans/${id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
};

export const investmentsApi = {
  list:     ()         => apiFetch('/api/investments'),
  reminders:()         => apiFetch('/api/investments/reminders'),
  create:   (data)     => apiFetch('/api/investments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  update:   (id, data) => apiFetch(`/api/investments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  remove:   (id)       => apiFetch(`/api/investments/${id}`, { method: 'DELETE' }),
  payments: (id)       => apiFetch(`/api/investments/${id}/payments`),
  addPayment:(id, data)=> apiFetch(`/api/investments/${id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
};

export const bankApi = {
  // Accounts
  accounts:       ()         => apiFetch('/api/bank/accounts'),
  createAccount:  (d)        => apiFetch('/api/bank/accounts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  updateAccount:  (id, d)    => apiFetch(`/api/bank/accounts/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  deleteAccount:  (id)       => apiFetch(`/api/bank/accounts/${id}`, { method:'DELETE' }),
  // Statement lines
  statements:     (p = {})   => apiFetch('/api/bank/statements?' + new URLSearchParams(p).toString()),
  addLine:        (d)        => apiFetch('/api/bank/statements', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  bulkLines:      (d)        => apiFetch('/api/bank/statements/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  updateLine:     (id, d)    => apiFetch(`/api/bank/statements/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  deleteLine:     (id)       => apiFetch(`/api/bank/statements/${id}`, { method:'DELETE' }),
  toggleLine:     (id)       => apiFetch(`/api/bank/statements/${id}/toggle`, { method:'PATCH' }),
  // Sessions
  sessions:       (p = {})   => apiFetch('/api/bank/sessions?' + new URLSearchParams(p).toString()),
  saveSession:    (d)        => apiFetch('/api/bank/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }),
  deleteSession:  (id)       => apiFetch(`/api/bank/sessions/${id}`, { method:'DELETE' }),
  // Exports
  exportPdfUrl:   (p = {})   => `/api/bank/export/pdf?${new URLSearchParams(p).toString()}`,
  exportExcelUrl: (p = {})   => `/api/bank/export/excel?${new URLSearchParams(p).toString()}`,
};

export const assetsApi = {
  list:        (params = {}) => apiFetch('/api/assets?' + new URLSearchParams(params).toString()),
  summary:     ()            => apiFetch('/api/assets/summary'),
  create:      (fd)          => fetch('/api/assets', { method: 'POST', body: fd }).then(r => r.json()),
  update:      (id, fd)      => fetch(`/api/assets/${id}`, { method: 'PUT', body: fd }).then(r => r.json()),
  remove:      (id)          => apiFetch(`/api/assets/${id}`, { method: 'DELETE' }),
  exportExcel: (params = {}) => `/api/assets/export/excel?${new URLSearchParams(params).toString()}`,
  exportPdf:   (params = {}) => `/api/assets/export/pdf?${new URLSearchParams(params).toString()}`,
};

export const invoicesApi = {
  // Company profiles
  companies:     ()         => apiFetch('/api/invoices/companies'),
  createCompany: (fd)       => fetch('/api/invoices/companies', { method:'POST', body:fd }).then(r => r.json()),
  updateCompany: (id, fd)   => fetch(`/api/invoices/companies/${id}`, { method:'PUT', body:fd }).then(r => r.json()),
  deleteCompany: (id)       => apiFetch(`/api/invoices/companies/${id}`, { method:'DELETE' }),
  // Invoices / Quotations
  list:          (p = {})   => apiFetch('/api/invoices?' + new URLSearchParams(p).toString()),
  get:           (id)       => apiFetch(`/api/invoices/${id}`),
  create:        (data)     => apiFetch('/api/invoices', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }),
  update:        (id, data) => apiFetch(`/api/invoices/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }),
  remove:        (id)       => apiFetch(`/api/invoices/${id}`, { method:'DELETE' }),
  pay:           (id, data) => apiFetch(`/api/invoices/${id}/pay`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }),
  nextNumber:    (type)     => apiFetch(`/api/invoices/next-number?type=${type}`),
  templates:     ()         => apiFetch('/api/invoices/templates/list'),
  pdfUrl:        (id)       => `/api/invoices/${id}/pdf`,
};

export const hrApi = {
  // Staff
  staff:          (p = {})   => apiFetch('/api/hr/staff?' + new URLSearchParams(p).toString()),
  staffGet:       (id)       => apiFetch(`/api/hr/staff/${id}`),
  staffCreate:    (fd)       => fetch('/api/hr/staff', { method: 'POST', body: fd }).then(r => r.json()),
  staffUpdate:    (id, fd)   => fetch(`/api/hr/staff/${id}`, { method: 'PUT', body: fd }).then(r => r.json()),
  staffDelete:    (id)       => apiFetch(`/api/hr/staff/${id}`, { method: 'DELETE' }),
  departments:    ()         => apiFetch('/api/hr/departments'),
  // Salary
  salarySet:      (id, d)    => apiFetch(`/api/hr/staff/${id}/salary`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  // Projects
  projectAssign:  (id, d)    => apiFetch(`/api/hr/staff/${id}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  projectRemove:  (id, pid)  => apiFetch(`/api/hr/staff/${id}/projects/${pid}`, { method: 'DELETE' }),
  // Advances
  advances:       (sid)      => apiFetch(`/api/hr/staff/${sid}/advances`),
  advanceCreate:  (sid, d)   => apiFetch(`/api/hr/staff/${sid}/advances`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  advanceUpdate:  (id, d)    => apiFetch(`/api/hr/advances/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  advanceDelete:  (id)       => apiFetch(`/api/hr/advances/${id}`, { method: 'DELETE' }),
  // Attendance
  attendance:     (p = {})   => apiFetch('/api/hr/attendance?' + new URLSearchParams(p).toString()),
  attendanceSave: (records)  => apiFetch('/api/hr/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(records) }),
  attendanceDel:  (sid, date)=> apiFetch(`/api/hr/attendance/${sid}/${date}`, { method: 'DELETE' }),
  // Payroll
  payroll:        (p = {})   => apiFetch('/api/hr/payroll?' + new URLSearchParams(p).toString()),
  payrollGenerate:(d)        => apiFetch('/api/hr/payroll/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  payrollGet:     (id)       => apiFetch(`/api/hr/payroll/${id}`),
  payrollUpdate:  (id, d)    => apiFetch(`/api/hr/payroll/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  payrollPay:     (id, d)    => apiFetch(`/api/hr/payroll/${id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  payrollPdfUrl:  (id)       => `/api/hr/payroll/${id}/pdf`,
  payrollExcelUrl:(p = {})   => `/api/hr/payroll/export/excel?${new URLSearchParams(p).toString()}`,
  payrollBulkPdf: (p = {})   => `/api/hr/payroll/export/pdf?${new URLSearchParams(p).toString()}`,
};

export const upcomingApi = {
  list:    (params = {}) => ajax({ url: '/upcoming', method: 'GET', data: params }),
  summary: ()            => ajax({ url: '/upcoming/summary', method: 'GET' }),
  create:  (data)        => ajax({ url: '/upcoming', method: 'POST', contentType: 'application/json', data: JSON.stringify(data) }),
  update:  (id, data)    => ajax({ url: `/upcoming/${id}`, method: 'PUT', contentType: 'application/json', data: JSON.stringify(data) }),
  pay:     (id)          => ajax({ url: `/upcoming/${id}/pay`, method: 'PATCH' }),
  remove:  (id)          => ajax({ url: `/upcoming/${id}`, method: 'DELETE' }),
};
