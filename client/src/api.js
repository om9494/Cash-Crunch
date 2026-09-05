import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Merchants ──────────────────────────────────────────────────────────────
export const getMerchants         = ()     => api.get('/api/merchants');
export const getMerchant          = (id)   => api.get(`/api/merchants/${id}`);
export const triggerForecast      = (id)   => api.post(`/api/merchants/${id}/forecast`);
export const triggerRecommend     = (id)   => api.post(`/api/merchants/${id}/recommend`);
export const triggerForecastAll   = ()     => api.post('/api/merchants/forecast-all', {}, { timeout: 120000 });
export const getMerchantTransactions = (id) => api.get(`/api/merchants/${id}/transactions`);

// ── Recommendations ────────────────────────────────────────────────────────
export const approveRecommendation = (id, chosen_option) =>
  api.post(`/api/recommendations/${id}/approve`, { chosen_option });

export const rejectRecommendation  = (id) =>
  api.post(`/api/recommendations/${id}/reject`);

// ── Payouts ────────────────────────────────────────────────────────────────
// SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
// without a business account.
export const getPayoutStatus = (payoutId) =>
  api.get(`/api/payouts/${payoutId}/status`);

// ── Admin / Demo ───────────────────────────────────────────────────────────
export const resetDemo = () => api.post('/api/admin/reset');

// ── Accuracy Report ────────────────────────────────────────────────────────
// Long timeout — AI service re-runs all 50 forecasts before responding
export const getAccuracyReport = () => api.get('/api/accuracy-report', { timeout: 120000 });

// ── Virtual Accounts ───────────────────────────────────────────────────────
export const getVirtualAccount  = (id) => api.get(`/api/merchants/${id}/virtual-account`);
export const getPlatformBalance = ()   => api.get('/api/platform-balance');

export default api;
