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

export const upcomingApi = {
  list:    (params = {}) => ajax({ url: '/upcoming', method: 'GET', data: params }),
  summary: ()            => ajax({ url: '/upcoming/summary', method: 'GET' }),
  create:  (data)        => ajax({ url: '/upcoming', method: 'POST', contentType: 'application/json', data: JSON.stringify(data) }),
  update:  (id, data)    => ajax({ url: `/upcoming/${id}`, method: 'PUT', contentType: 'application/json', data: JSON.stringify(data) }),
  pay:     (id)          => ajax({ url: `/upcoming/${id}/pay`, method: 'PATCH' }),
  remove:  (id)          => ajax({ url: `/upcoming/${id}`, method: 'DELETE' }),
};
