import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, BarChart, Bar,
} from 'recharts';
import {
  getMerchant,
  triggerForecast,
  triggerRecommend,
  approveRecommendation,
  rejectRecommendation,
  getPayoutStatus,
  getMerchantTransactions,
} from '../api.js';
import RunwayGauge from '../components/RunwayGauge.jsx';
import VirtualLedger from '../components/VirtualLedger.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatMoney, formatDate } from '../utils/formatMoney.js';
import { colors, fonts, recStatusColor, payoutStatusColor } from '../theme.js';

// ── Friendly error decoder ────────────────────────────────────────────────
function friendlyDetailError(rawError) {
  if (!rawError) return 'Something went wrong.';
  const lower = rawError.toLowerCase();
  if (lower.includes('network error') || lower.includes('econnrefused'))
    return 'Cannot reach the server. Make sure the Express server is running on port 5000.';
  if (lower.includes('502') || lower.includes('ai service unavailable'))
    return 'The AI forecasting service is offline. Start it with: cd ai-service && uvicorn main:app --reload';
  if (lower.includes('timeout'))
    return 'Request timed out — check that MongoDB and the Express server are both running.';
  if (lower.includes('not found') || lower.includes('404'))
    return 'Merchant not found. It may have been removed by a seed reset.';
  return rawError;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function deriveRunway(forecast) {
  if (!forecast) return null;
  if (forecast.shortfall_detected && forecast.shortfall_date) {
    const diff = Math.floor((new Date(forecast.shortfall_date) - new Date()) / 86400000);
    return Math.max(0, diff);
  }
  return forecast.daily_projected_balance?.length ?? null;
}

// ── Tooltips ──────────────────────────────────────────────────────────────
function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div style={{
      background: colors.panel, border: `1px solid ${colors.border}`,
      borderRadius: 6, padding: '8px 12px',
      fontFamily: fonts.mono, fontSize: 12,
    }}>
      <div style={{ color: colors.textSecondary, marginBottom: 3 }}>{label}</div>
      <div style={{ color: val < 0 ? colors.red : colors.cyanLight, fontWeight: 600 }}>
        {formatMoney(val)}
      </div>
    </div>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: colors.panel, border: `1px solid ${colors.border}`,
      borderRadius: 6, padding: '8px 12px',
      fontFamily: fonts.mono, fontSize: 12,
    }}>
      <div style={{ color: colors.textSecondary, marginBottom: 3 }}>{label}</div>
      <div style={{ color: colors.cyanLight, fontWeight: 600 }}>
        {formatMoney(payload[0]?.value, { compact: true })}
      </div>
    </div>
  );
}

// ── Timeline Strip ────────────────────────────────────────────────────────
function TimelineStrip({ projections = [], emiDate, payDate }) {
  if (!projections.length) return null;
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 2,
        minWidth: 'max-content', paddingTop: 20, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', bottom: 28, left: 0, right: 0,
          height: 1, background: colors.border,
        }} />
        {projections.map((d, i) => {
          const date = new Date(d.date);
          const isEmi = emiDate && new Date(emiDate).toDateString() === date.toDateString();
          const isPay = payDate && new Date(payDate).toDateString() === date.toDateString();
          const isShortfall = d.balance_paise < 0;
          const tickColor = isShortfall ? colors.red : (isEmi || isPay) ? colors.amber : colors.muted;
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              position: 'relative', width: 52,
            }}>
              {(isEmi || isPay) && (
                <div style={{
                  position: 'absolute', top: -18,
                  fontFamily: fonts.mono, fontSize: 9, letterSpacing: '0.04em',
                  color: colors.amberLight, background: colors.amberBg,
                  border: `1px solid ${colors.amberDim}`, borderRadius: 3,
                  padding: '1px 4px', whiteSpace: 'nowrap', zIndex: 1,
                }}>
                  {isEmi ? '⚑ EMI' : '⚑ PAY'}
                </div>
              )}
              <div style={{
                width: 1, height: (isEmi || isPay) ? 18 : 10,
                background: tickColor, marginBottom: 6,
              }} />
              <div style={{
                width: 3,
                height: Math.max(2, Math.min(30, Math.abs(d.balance_paise) / 1_000_000)),
                background: isShortfall ? colors.redDim : colors.cyanDim,
                borderRadius: 1, marginBottom: 4,
              }} />
              <span style={{
                fontFamily: fonts.mono, fontSize: 10,
                color: (isEmi || isPay) ? colors.amberLight : colors.textDim,
                whiteSpace: 'nowrap', transform: 'rotate(-45deg)',
                transformOrigin: 'top left', display: 'block',
                marginLeft: 10, marginTop: 4,
              }}>
                {formatDate(d.date, 'day')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Transaction Panel ─────────────────────────────────────────────────────
function TransactionPanel({ merchantId }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!merchantId) return;
    setLoading(true);
    getMerchantTransactions(merchantId)
      .then((res) => { setData(res.data); setLoading(false); })
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
        setLoading(false);
      });
  }, [merchantId]);

  if (loading) return (
    <div style={{ padding: 20 }}>
      {[80, 60, 50, 70, 55].map((w, i) => (
        <div key={i} style={{
          height: 12, background: colors.lift, borderRadius: 3,
          width: `${w}%`, marginBottom: 10,
        }} />
      ))}
    </div>
  );

  if (error) return (
    <div style={{
      padding: '20px 16px', fontFamily: fonts.mono, fontSize: 12,
      color: colors.textDim, textAlign: 'center',
    }}>
      {error}
    </div>
  );

  if (!data) return null;

  const {
    total_transactions, captured_count, failed_count,
    total_captured_paise, avg_transaction_paise,
    monthly_totals, last_5,
  } = data;

  // Format month label "YYYY-MM" → "Aug"
  const barData = monthly_totals.map((m) => ({
    label: new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
    total: m.total_paise,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Stats row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        {[
          { label: 'Total Txns',    value: total_transactions, color: colors.textPrimary },
          { label: 'Captured',      value: captured_count,     color: colors.teal        },
          { label: 'Failed',        value: failed_count,       color: failed_count > 0 ? colors.red : colors.textDim },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '14px 16px',
            borderRight: i < 2 ? `1px solid ${colors.border}` : 'none',
          }}>
            <div style={{
              fontFamily: fonts.mono, fontSize: 10, color: colors.textDim,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
            }}>{s.label}</div>
            <div style={{
              fontFamily: fonts.mono, fontSize: 20, fontWeight: 700, color: s.color,
            }}>{s.value.toLocaleString('en-IN')}</div>
          </div>
        ))}
      </div>

      {/* ── Money stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        {[
          { label: 'Total Revenue',   value: formatMoney(total_captured_paise, { compact: true }),   color: colors.tealLight },
          { label: 'Avg Transaction', value: formatMoney(avg_transaction_paise, { compact: true }), color: colors.cyanLight },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '12px 16px',
            borderRight: i === 0 ? `1px solid ${colors.border}` : 'none',
          }}>
            <div style={{
              fontFamily: fonts.mono, fontSize: 10, color: colors.textDim,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
            }}>{s.label}</div>
            <div style={{
              fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: s.color,
            }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Monthly bar chart ── */}
      {barData.length > 0 && (
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={{
            fontFamily: fonts.mono, fontSize: 10, color: colors.textDim,
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
          }}>Monthly Revenue</div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: fonts.mono, fontSize: 10, fill: colors.textDim }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="total" fill={colors.cyan} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Last 5 transactions ── */}
      <div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.6fr',
          padding: '8px 16px', background: colors.lift,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {['Date', 'Amount', 'Status'].map((h) => (
            <span key={h} style={{
              fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
              color: colors.textDim, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{h}</span>
          ))}
        </div>

        {(!last_5 || last_5.length === 0) ? (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontFamily: fonts.mono, fontSize: 12, color: colors.textDim,
          }}>
            No transactions yet
          </div>
        ) : (
          last_5.map((t, i) => (
            <div key={t.payment_id ?? i} style={{
              display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.6fr',
              padding: '9px 16px', alignItems: 'center',
              borderBottom: i < last_5.length - 1 ? `1px solid ${colors.border}` : 'none',
              background: i % 2 === 0 ? colors.panel : colors.lift,
            }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary }}>
                {formatDate(t.captured_at, 'long')}
              </span>
              <span style={{
                fontFamily: fonts.mono, fontSize: 13, fontWeight: 600,
                color: t.status === 'captured' ? colors.textPrimary : colors.red,
              }}>
                {formatMoney(t.amount_paise, { compact: true })}
              </span>
              <span style={{
                fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: t.status === 'captured' ? colors.teal : colors.red,
                background: t.status === 'captured' ? colors.tealBg : colors.redBg,
                border: `1px solid ${t.status === 'captured' ? colors.tealDim : colors.redDim}`,
                borderRadius: 3, padding: '2px 6px', display: 'inline-block',
              }}>
                {t.status === 'captured' ? '✓ done' : '✕ fail'}
              </span>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

// ── Recommendation Panel sub-components ──────────────────────────────────

function OptionTypeLabel({ type, recommended }) {
  const labels = {
    instant_advance:  { label: 'Instant Advance', color: colors.cyan  },
    alert_only:       { label: 'Alert Only',       color: colors.amber },
    contact_lender:   { label: 'Contact Lender',   color: colors.teal  },
    defer_payroll:    { label: 'Defer Payroll',    color: colors.amber },
    draw_credit_line: { label: 'Credit Line',      color: colors.cyan  },
    reduce_expenses:  { label: 'Cut Expenses',     color: colors.teal  },
    partial_draw:     { label: 'Partial Draw',     color: colors.cyan  },
  };
  const scheme = labels[type] ?? { label: type, color: colors.textSecondary };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: scheme.color, background: `${scheme.color}14`,
        border: `1px solid ${scheme.color}40`, borderRadius: 3, padding: '2px 7px',
      }}>
        {scheme.label}
      </span>
      {recommended && (
        <span style={{
          fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
          color: colors.teal, background: colors.tealBg,
          border: `1px solid ${colors.tealDim}`, borderRadius: 3,
          padding: '2px 6px', letterSpacing: '0.06em',
        }}>★ Recommended</span>
      )}
    </div>
  );
}

function BreakerSwitch({ label, on, danger = false, onClick, disabled = false }) {
  const activeColor = danger ? colors.red : colors.teal;
  const activeBg    = danger ? colors.redBg : colors.tealBg;
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 14px',
        background: on ? activeBg : colors.lift,
        border: `1px solid ${on ? activeColor : colors.border}`,
        borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, transition: 'all 0.15s',
        color: on ? activeColor : colors.textSecondary,
        fontFamily: fonts.mono, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}
      onFocus={(e) => { if (!disabled) e.currentTarget.style.outline = `2px solid ${activeColor}`; }}
      onBlur={(e)  => { e.currentTarget.style.outline = 'none'; }}
    >
      <span style={{
        display: 'inline-block', width: 28, height: 14,
        background: on ? activeColor : colors.muted,
        borderRadius: 7, position: 'relative', transition: 'background 0.15s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 16 : 2,
          width: 10, height: 10,
          background: on ? colors.panel : colors.textDim,
          borderRadius: '50%', transition: 'left 0.15s',
        }} />
      </span>
      {label}
    </button>
  );
}

const PAYOUT_STAGES = ['queued', 'processing', 'processed'];

function PayoutProgressStrip({ payoutState }) {
  if (!payoutState) return null;
  const { status, payout_id, amount_paise, utr, error } = payoutState;
  if (error) {
    return (
      <div style={{
        marginTop: 14, padding: '12px 14px',
        background: colors.redBg, border: `1px solid ${colors.redDim}`, borderRadius: 6,
      }}>
        <div style={{
          fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: colors.red, marginBottom: 6,
        }}>✕ Payout Failed</div>
        <div style={{ fontFamily: fonts.body, fontSize: 12, color: colors.redLight }}>{error}</div>
      </div>
    );
  }
  const scheme   = payoutStatusColor[status] ?? payoutStatusColor.queued;
  const stageIdx = PAYOUT_STAGES.indexOf(status);
  return (
    <div style={{
      marginTop: 14, padding: '12px 14px',
      background: scheme.bg, border: `1px solid ${scheme.border}`, borderRadius: 6,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, flexWrap: 'wrap', gap: 6,
      }}>
        <span style={{
          fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: scheme.text,
        }}>
          {/* SYNTHETIC: RazorpayX payout lifecycle — no public sandbox */}
          RazorpayX Payout
        </span>
        {payout_id && (
          <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.textDim, letterSpacing: '0.03em' }}>
            {payout_id}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        {PAYOUT_STAGES.map((stage, i) => {
          const done   = stageIdx > i;
          const active = stageIdx === i;
          const sc     = payoutStatusColor[stage];
          const dot    = done || active ? sc.border : colors.muted;
          const lbl    = done || active ? sc.text   : colors.textDim;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: active || done ? dot : 'transparent',
                  border: `2px solid ${dot}`, transition: 'all 0.3s',
                  boxShadow: active ? `0 0 6px ${dot}` : 'none', flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: fonts.mono, fontSize: 9, fontWeight: active ? 600 : 400,
                  letterSpacing: '0.06em', textTransform: 'uppercase', color: lbl,
                  marginTop: 4, whiteSpace: 'nowrap',
                }}>{stage}</span>
              </div>
              {i < 2 && (
                <div style={{
                  flex: 1, height: 1,
                  background: done ? sc.border : colors.border,
                  margin: '0 4px', marginBottom: 14, transition: 'background 0.3s',
                }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {amount_paise != null && (
          <div>
            <div style={{
              fontFamily: fonts.mono, fontSize: 9, color: colors.textDim,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
            }}>Amount</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: 600, color: scheme.text }}>
              {formatMoney(amount_paise)}
            </div>
          </div>
        )}
        {utr && (
          <div>
            <div style={{
              fontFamily: fonts.mono, fontSize: 9, color: colors.textDim,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
            }}>UTR</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.tealLight, letterSpacing: '0.04em' }}>
              {utr}
            </div>
          </div>
        )}
        {status === 'processed' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: fonts.mono, fontSize: 11, color: colors.tealLight,
            fontWeight: 600, letterSpacing: '0.04em',
          }}>✓ Runway updated</div>
        )}
      </div>
    </div>
  );
}

function RecommendationPanel({
  recommendation, merchantId, onStatusChange,
  shortfallDetected, onRecommend, recommending,
}) {
  const [submitting, setSubmitting] = useState(null);
  const [actionError, setActionError] = useState(null);
  // SYNTHETIC: models RazorpayX payout lifecycle, no public sandbox
  const [payoutState, setPayoutState] = useState(null);

  if (!recommendation) {
    if (shortfallDetected) {
      return (
        <div style={{
          padding: 24, background: colors.panel,
          border: `1px solid ${colors.border}`, borderRadius: 8,
          textAlign: 'center', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: colors.amberBg, border: `1px solid ${colors.amberDim}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>⚠</div>
          <div style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
            Shortfall detected — no action plan yet
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, lineHeight: 1.5, maxWidth: 260 }}>
            The forecast shows a cash shortfall. Generate remediation options to see how to resolve it.
          </div>
          <button
            onClick={onRecommend} disabled={recommending}
            style={{
              padding: '8px 20px',
              background: recommending ? colors.lift : colors.cyan,
              border: `1px solid ${recommending ? colors.border : colors.cyan}`,
              borderRadius: 6, cursor: recommending ? 'not-allowed' : 'pointer',
              color: recommending ? colors.textSecondary : '#fff',
              fontFamily: fonts.mono, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.04em', opacity: recommending ? 0.7 : 1, transition: 'all 0.15s',
            }}
          >
            {recommending ? '… Generating' : '✦ Generate Suggestions'}
          </button>
        </div>
      );
    }
    return (
      <div style={{
        padding: 20, background: colors.panel,
        border: `1px solid ${colors.border}`, borderRadius: 8,
        textAlign: 'center', fontFamily: fonts.mono, fontSize: 12, color: colors.textDim,
      }}>
        No shortfall detected — no recommendations needed.
      </div>
    );
  }

  const { _id, options = [], status, chosen_option } = recommendation;
  const isPending = status === 'pending';
  const scheme    = recStatusColor[status] ?? recStatusColor.pending;

  async function pollPayoutUntilProcessed(payoutId, updatedForecast) {
    const POLL_INTERVAL_MS = 800;
    const MAX_POLLS = 30;
    let polls = 0;
    return new Promise((resolve) => {
      const tick = async () => {
        polls++;
        try {
          const res = await getPayoutStatus(payoutId);
          const p = res.data;
          setPayoutState({ payout_id: p.payout_id, status: p.status, amount_paise: p.amount_paise, utr: p.utr ?? null });
          if (p.status === 'processed' || p.status === 'failed' || polls >= MAX_POLLS) {
            // Reload to pick up final payout status in the ledger —
            // pass the already-applied updatedForecast so we don't
            // overwrite the gauge with a potentially stale DB read.
            onStatusChange(updatedForecast);
            resolve(p.status);
            return;
          }
        } catch (err) {
          console.warn('[PayoutPoll]', err.message);
          if (polls >= MAX_POLLS) { resolve('unknown'); return; }
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      };
      setTimeout(tick, POLL_INTERVAL_MS);
    });
  }

  async function handleApprove(option) {
    setSubmitting('approve');
    setActionError(null);
    setPayoutState(null);
    try {
      const res = await approveRecommendation(_id, option);
      const { payout, updated_forecast } = res.data;
      if (payout) {
        // SYNTHETIC: models RazorpayX payout lifecycle, no public sandbox
        setPayoutState({ payout_id: payout.payout_id, status: payout.status, amount_paise: payout.amount_paise, utr: null });
        setSubmitting(null);

        // Apply the updated forecast IMMEDIATELY — don't wait for payout to process.
        // The bank balance was already credited server-side before this response.
        if (updated_forecast) {
          onStatusChange(updated_forecast);
        }

        await pollPayoutUntilProcessed(payout.payout_id, updated_forecast);
      } else {
        onStatusChange(updated_forecast);
        setSubmitting(null);
      }
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.detail ?? errData?.error ?? 'Approve failed';
      if (errData?.reason) {
        setPayoutState({ error: `${errData.reason}: ${msg}` });
      } else {
        setActionError(msg);
      }
      onStatusChange(null);
      setSubmitting(null);
    }
  }

  async function handleReject() {
    setSubmitting('reject');
    setActionError(null);
    try {
      await rejectRecommendation(_id);
      onStatusChange(null);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Reject failed');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
      }}>
        <span style={{
          fontFamily: fonts.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textSecondary,
        }}>Recommendations</span>
        <StatusBadge status={status} variant="rec" />
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {options.map((opt, i) => {
          const isChosen = chosen_option?.type === opt.type;
          return (
            <div key={i} style={{
              background: isChosen ? `${scheme.border}10` : colors.lift,
              border: `1px solid ${isChosen ? scheme.border : colors.border}`,
              borderRadius: 6, padding: '14px 16px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 10, flexWrap: 'wrap', gap: 8,
              }}>
                <OptionTypeLabel type={opt.type} recommended={opt.recommended} />
                {isChosen && (
                  <span style={{
                    fontFamily: fonts.mono, fontSize: 10, color: scheme.text,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>✓ chosen</span>
                )}
              </div>
              <p style={{
                fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary,
                marginBottom: 12, lineHeight: 1.5,
              }}>{opt.description}</p>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: isPending ? 14 : 0 }}>
                <div>
                  <div style={{
                    fontFamily: fonts.mono, fontSize: 10, color: colors.textDim,
                    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
                  }}>Cost</div>
                  <div style={{
                    fontFamily: fonts.mono, fontSize: 14, fontWeight: 600,
                    color: opt.cost_paise > 0 ? colors.amberLight : colors.tealLight,
                  }}>
                    {opt.cost_paise === 0 ? 'Free' : formatMoney(opt.cost_paise, { compact: true })}
                  </div>
                </div>
                <div>
                  <div style={{
                    fontFamily: fonts.mono, fontSize: 10, color: colors.textDim,
                    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
                  }}>Resulting Balance</div>
                  <div style={{
                    fontFamily: fonts.mono, fontSize: 14, fontWeight: 600,
                    color: opt.resulting_balance_paise < 0 ? colors.red : colors.tealLight,
                  }}>
                    {formatMoney(opt.resulting_balance_paise, { compact: true })}
                  </div>
                </div>
              </div>
              {isPending && (
                <div style={{ marginTop: 4 }}>
                  <BreakerSwitch label="Approve" on={false} disabled={!!submitting} onClick={() => handleApprove(opt)} />
                </div>
              )}
              {isChosen && payoutState && <PayoutProgressStrip payoutState={payoutState} />}
            </div>
          );
        })}

        {isPending && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 8, borderTop: `1px solid ${colors.border}`,
            flexWrap: 'wrap', gap: 8,
          }}>
            <BreakerSwitch label="Reject All" on={false} danger disabled={!!submitting} onClick={handleReject} />
            {actionError && (
              <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.redLight }}>
                {actionError}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function MerchantDetail({ merchantId, onBack }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [forecasting, setForecasting]   = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [actionMsg, setActionMsg]       = useState(null);
  const [ledgerKey, setLedgerKey]       = useState(0);

  const load = useCallback((prefetchedForecast = null, refreshLedger = false) => {
    setLoading(true);
    setError(null);
    getMerchant(merchantId)
      .then((res) => {
        const incoming = res.data;
        if (prefetchedForecast && prefetchedForecast.merchant_id === merchantId)
          incoming.latest_forecast = prefetchedForecast;
        setData(incoming);
        setLoading(false);
        if (refreshLedger) setLedgerKey((k) => k + 1);
      })
      .catch((err) => { setError(err.response?.data?.error || err.message); setLoading(false); });
  }, [merchantId]);

  // silentLoad — bypasses browser cache with a timestamp query param so we
  // never get a 304 with an empty body when the data has actually changed.
  const silentLoad = useCallback((prefetchedForecast = null, refreshLedger = false) => {
    // Add _t to bust the browser's ETag/304 cache
    getMerchant(`${merchantId}?_t=${Date.now()}`)
      .then((res) => {
        const incoming = res.data;
        if (prefetchedForecast && prefetchedForecast.merchant_id === merchantId)
          incoming.latest_forecast = prefetchedForecast;
        setData(incoming);
        if (refreshLedger) setLedgerKey((k) => k + 1);
      })
      .catch((err) => console.warn('[silentLoad] failed:', err.message));
  }, [merchantId]);

  // applyForecast — directly patches the forecast in state without a network
  // round-trip. Used immediately after approval so the chart updates instantly
  // regardless of network cache / 304 behaviour.
  const applyForecast = useCallback((updatedForecast, updatedRec = null) => {
    if (!updatedForecast) return;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        latest_forecast: updatedForecast,
        ...(updatedRec ? { latest_recommendation: updatedRec } : {}),
      };
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleForecast() {
    setForecasting(true);
    setActionMsg(null);
    try {
      const forecastRes = await triggerForecast(merchantId);
      const freshForecast = forecastRes.data;
      // Apply the new forecast directly into state immediately
      applyForecast(freshForecast);
      // Background refresh to pick up any other DB changes
      silentLoad(freshForecast);
      if (freshForecast?.shortfall_detected) {
        try {
          const recRes = await triggerRecommend(merchantId);
          // Splice in the new recommendation directly
          setData((prev) => prev ? { ...prev, latest_recommendation: recRes.data } : prev);
        } catch (recErr) {
          console.warn('[handleForecast] auto-recommend failed:', recErr.message);
        }
      }
    } catch (err) {
      const raw = err.response?.data?.error || err.message || '';
      setActionMsg({
        text: raw.toLowerCase().includes('ai service')
          ? 'AI service is offline — start it with: cd ai-service && uvicorn main:app --reload'
          : raw || 'Forecast failed',
        isError: true,
      });
    } finally { setForecasting(false); }
  }

  async function handleRecommend() {
    setRecommending(true);
    setActionMsg(null);
    try {
      await triggerRecommend(merchantId);
      silentLoad();
    } catch (err) {
      const raw = err.response?.data?.detail || err.response?.data?.error || err.message || '';
      if (err.response?.status === 400) {
        setActionMsg({ text: 'No shortfall detected — recommendations only generate when a shortfall is projected.', isError: false });
      } else {
        setActionMsg({
          text: raw.toLowerCase().includes('ai service')
            ? 'AI service is offline — start it with: cd ai-service && uvicorn main:app --reload'
            : raw || 'Recommend failed',
          isError: true,
        });
      }
    } finally { setRecommending(false); }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ width: 80, height: 30, background: colors.panel, borderRadius: 5 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[90, 110].map((w, i) => (
              <div key={i} style={{ width: w, height: 30, background: colors.panel, borderRadius: 5 }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 28, alignItems: 'flex-start' }}>
          <div style={{ width: 200, height: 200, borderRadius: '50%', background: colors.panel, flexShrink: 0 }} />
          <div style={{ flex: 1, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ height: 28, background: colors.panel, borderRadius: 4, width: '55%' }} />
            <div style={{ height: 12, background: colors.panel, borderRadius: 3, width: '40%' }} />
            <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
              <div style={{ height: 36, width: 120, background: colors.panel, borderRadius: 4 }} />
              <div style={{ height: 36, width: 120, background: colors.panel, borderRadius: 4 }} />
            </div>
          </div>
        </div>
        <div style={{ height: 80, background: colors.panel, borderRadius: 8, marginBottom: 20 }} />
        <div style={{ height: 260, background: colors.panel, borderRadius: 8, marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 20 }}>
          {[240, 240, 240].map((h, i) => (
            <div key={i} style={{ height: h, background: colors.panel, borderRadius: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <div style={{
          marginTop: 16, padding: '20px 24px', background: colors.panel,
          border: `1px solid ${colors.redDim}`, borderLeft: `4px solid ${colors.red}`, borderRadius: 8,
        }}>
          <div style={{
            fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.red, marginBottom: 8,
          }}>✕ Failed to load merchant</div>
          <div style={{ fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 1.6 }}>
            {friendlyDetailError(error)}
          </div>
        </div>
      </div>
    );
  }

  const { merchant, latest_forecast, latest_recommendation } = data;
  const forecast    = latest_forecast;
  const projections = forecast?.daily_projected_balance ?? [];
  const runway      = deriveRunway(forecast);
  const shortfall   = forecast?.shortfall_detected;

  const chartData = projections.map((d) => ({
    date: formatDate(d.date, 'day'), balance: d.balance_paise,
  }));
  const emiDate = merchant?.next_emi_date;
  const payDate = merchant?.next_payroll_date;
  const yMin = chartData.length ? Math.min(...chartData.map((d) => d.balance)) * 1.15 : 0;
  const yMax = chartData.length ? Math.max(...chartData.map((d) => d.balance)) * 1.1 : 100;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Top nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: actionMsg ? 12 : 24, flexWrap: 'wrap', gap: 12,
      }}>
        <button onClick={onBack} style={backBtnStyle}>← Fleet</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionButton onClick={handleForecast} loading={forecasting} disabled={forecasting || recommending}>
            ↻ Forecast
          </ActionButton>
          <ActionButton onClick={handleRecommend} loading={recommending} disabled={forecasting || recommending}>
            ✦ Recommend
          </ActionButton>
        </div>
      </div>

      {actionMsg && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: actionMsg.isError ? colors.panel : colors.tealBg,
          border: `1px solid ${actionMsg.isError ? colors.redDim : colors.tealDim}`,
          borderLeft: `3px solid ${actionMsg.isError ? colors.red : colors.teal}`,
          borderRadius: 6, fontFamily: fonts.body, fontSize: 13,
          color: actionMsg.isError ? colors.textSecondary : colors.tealLight, lineHeight: 1.5,
        }}>
          {actionMsg.text}
        </div>
      )}

      {/* Hero: gauge + merchant info */}
      <div style={{
        display: 'flex', gap: 32, alignItems: 'flex-start',
        marginBottom: 28, flexWrap: 'wrap',
      }}>
        <div style={{ flexShrink: 0 }}>
          <RunwayGauge daysOfRunway={runway} size={200} label="days runway" />
        </div>
        <div style={{ flex: 1, minWidth: 200, paddingTop: 12 }}>
          <h2 style={{
            fontFamily: fonts.display, fontSize: 26, fontWeight: 700,
            color: colors.textPrimary, letterSpacing: '-0.02em', marginBottom: 4,
          }}>{merchant.name}</h2>
          <div style={{
            fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary,
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14,
          }}>
            {merchant.business_type} · {merchant.employees_count} employees · {merchant.merchant_id}
          </div>

          {/* Key metrics */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {shortfall && forecast?.shortfall_date && (
              <MetricPill label="Shortfall Date" value={formatDate(forecast.shortfall_date, 'long')} color={colors.red} />
            )}
            {shortfall && (
              <MetricPill label="Gap" value={formatMoney(forecast.shortfall_amount_paise, { compact: true })} color={colors.red} />
            )}
            {!shortfall && <MetricPill label="Status" value="Healthy" color={colors.teal} />}
            {forecast?.generated_at && (
              <MetricPill label="Forecast Run" value={formatDate(forecast.generated_at, 'long')} color={colors.textSecondary} />
            )}
          </div>

          {/* Loan + Payroll — SYNTHETIC */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14 }}>
            {merchant.emi_amount_paise != null && (
              <MetricPill
                label="Next EMI"
                value={`${formatMoney(merchant.emi_amount_paise, { compact: true })} · ${formatDate(merchant.next_emi_date, 'long')}`}
                color={colors.amber}
              />
            )}
            {merchant.total_salary_paise != null && (
              <MetricPill
                label="Payroll"
                value={`${formatMoney(merchant.total_salary_paise, { compact: true })} · ${formatDate(merchant.next_payroll_date, 'long')}`}
                color={colors.textSecondary}
              />
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {projections.length > 0 && (
        <Section label="14-Day Timeline">
          <TimelineStrip projections={projections} emiDate={emiDate} payDate={payDate} />
        </Section>
      )}

      {/* Projection chart */}
      {chartData.length > 0 && (
        <Section label="Projected Balance">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={colors.chartGrid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontFamily: fonts.mono, fontSize: 10, fill: colors.textDim }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatMoney(v, { compact: true })}
                  tick={{ fontFamily: fonts.mono, fontSize: 10, fill: colors.textDim }}
                  axisLine={false} tickLine={false} width={70}
                  domain={[yMin, yMax]}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <ReferenceLine y={0} stroke={colors.red} strokeDasharray="4 3" strokeOpacity={0.6} />
                <Line
                  type="monotone" dataKey="balance"
                  stroke={shortfall ? colors.red : colors.chartLine}
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    return payload.balance < 0
                      ? <circle key={cx} cx={cx} cy={cy} r={3} fill={colors.red} />
                      : null;
                  }}
                  activeDot={{ r: 4, fill: colors.cyanLight, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Three-column bottom: Recommendations | Transactions | Virtual Ledger */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)',
        gap: 20, marginTop: 20,
        // Collapse to 1 column on narrow screens
      }}>
        {/* Recommendations */}
        {latest_recommendation?.status === 'approved' && !shortfall ? (
          <div style={{
            background: colors.tealBg, border: `1px solid ${colors.tealDim}`,
            borderRadius: 8, padding: '20px 24px',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: colors.teal, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 22, color: '#fff', flexShrink: 0,
            }}>✓</div>
            <div>
              <div style={{
                fontFamily: fonts.display, fontSize: 15, fontWeight: 700,
                color: colors.tealLight, marginBottom: 4,
              }}>Shortfall Resolved</div>
              <div style={{ fontFamily: fonts.body, fontSize: 13, color: colors.tealLight, lineHeight: 1.5 }}>
                The instant advance was applied and the 14-day runway is now clear.
                {latest_recommendation.chosen_option?.type && (
                  <> Option used: <strong>{latest_recommendation.chosen_option.type.replace(/_/g, ' ')}</strong>.</>
                )}
              </div>
            </div>
          </div>
        ) : (
          <RecommendationPanel
            recommendation={latest_recommendation}
            merchantId={merchantId}
            shortfallDetected={!!shortfall}
            onRecommend={handleRecommend}
            recommending={recommending}
            onStatusChange={(updatedForecast) => {
              // 1. Apply the new forecast directly into state — no network call,
              //    no risk of 304 returning stale data.
              if (updatedForecast) {
                applyForecast(updatedForecast);
              }
              // 2. Separately refresh merchant data from DB (cache-busted) to
              //    pick up the updated recommendation status and ledger entries.
              silentLoad(updatedForecast, true);
            }}
          />
        )}

        {/* Payment Activity */}
        <div style={{
          background: colors.panel, border: `1px solid ${colors.border}`,
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
            background: colors.lift,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.cyan }} />
              <span style={{
                fontFamily: fonts.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textPrimary,
              }}>Payment Activity</span>
            </div>
            <span style={{
              fontFamily: fonts.mono, fontSize: 9, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: colors.textDim,
              background: colors.panel, border: `1px solid ${colors.border}`,
              borderRadius: 3, padding: '1px 5px',
            }}>PG Data</span>
          </div>
          <TransactionPanel merchantId={merchantId} />
        </div>

        {/* Virtual Ledger */}
        <VirtualLedger merchantId={merchantId} refreshTrigger={ledgerKey} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{
      background: colors.panel, border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: 16, marginBottom: 20, overflow: 'hidden',
    }}>
      <div style={{
        fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: colors.textDim, marginBottom: 14,
      }}>{label}</div>
      {children}
    </div>
  );
}

function MetricPill({ label, value, color }) {
  return (
    <div>
      <div style={{
        fontFamily: fonts.mono, fontSize: 10, color: colors.textDim,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3,
      }}>{label}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: 14, fontWeight: 600, color }}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: '7px 14px', background: colors.lift,
        border: `1px solid ${colors.border}`, borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: fonts.mono, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        color: colors.textSecondary, transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = colors.cyan;
          e.currentTarget.style.color = colors.cyanLight;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.color = colors.textSecondary;
      }}
      onFocus={(e)  => { if (!disabled) e.currentTarget.style.outline = `2px solid ${colors.cyan}`; }}
      onBlur={(e)   => { e.currentTarget.style.outline = 'none'; }}
    >
      {loading ? '…' : children}
    </button>
  );
}

const backBtnStyle = {
  padding: '6px 12px', background: 'transparent',
  border: `1px solid ${colors.border}`, borderRadius: 5, cursor: 'pointer',
  fontFamily: fonts.mono, fontSize: 11, fontWeight: 500,
  color: colors.textSecondary, letterSpacing: '0.04em',
};
