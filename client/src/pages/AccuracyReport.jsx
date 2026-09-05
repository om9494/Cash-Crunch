import { useEffect, useState } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { getAccuracyReport } from '../api.js';
import { formatDate } from '../utils/formatMoney.js';
import { colors, fonts } from '../theme.js';

export default function AccuracyReport() {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [running, setRunning] = useState(false);

  function fetchReport() {
    setLoading(true);
    setRunning(true);
    setError(null);
    getAccuracyReport()
      .then((res) => { setReport(res.data); setLoading(false); setRunning(false); })
      .catch((err) => {
        const msg = err.response?.data?.error || err.message || 'Failed to load';
        setError(msg);
        setLoading(false);
        setRunning(false);
      });
  }

  useEffect(() => { fetchReport(); }, []);

  // ── grade helper ─────────────────────────────────────────────────────────
  function grade(v) {
    if (v == null) return { label: '—',   color: colors.textDim  };
    if (v >= 0.85) return { label: 'GOOD', color: colors.teal    };
    if (v >= 0.65) return { label: 'FAIR', color: colors.amber   };
    return              { label: 'POOR', color: colors.red       };
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{
            fontFamily: fonts.mono, fontSize: 10, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: colors.cyan, marginBottom: 6,
          }}>System Diagnostics</div>
          <h1 style={{
            fontFamily: fonts.display, fontSize: 24, fontWeight: 700,
            color: colors.textPrimary, letterSpacing: '-0.02em', margin: 0,
          }}>Forecast Accuracy Report</h1>
          {report?.generated_at && (
            <div style={{
              fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, marginTop: 5,
            }}>
              run {report.run_id?.slice(0, 8)}…  ·  {formatDate(report.generated_at, 'long')}
            </div>
          )}
        </div>
        <button
          onClick={fetchReport}
          disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 18px',
            background: running ? colors.lift : colors.cyan,
            border: `1px solid ${running ? colors.border : colors.cyan}`,
            borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer',
            color: running ? colors.textSecondary : '#fff',
            fontFamily: fonts.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            opacity: running ? 0.7 : 1, transition: 'all 0.15s',
          }}
        >
          <span style={{ display: 'inline-block', animation: running ? 'spin 1s linear infinite' : 'none' }}>↻</span>
          {running ? 'Running…' : 'Re-run Report'}
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: `3px solid ${colors.border}`,
            borderTopColor: colors.cyan,
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, letterSpacing: '0.06em' }}>
            Running forecasts for all 50 merchants…
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim }}>
            This takes about 30–60 seconds
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{
          padding: '20px 24px', background: colors.redBg,
          border: `1px solid ${colors.redDim}`, borderLeft: `4px solid ${colors.red}`,
          borderRadius: 8, marginBottom: 20,
        }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 11, fontWeight: 600, color: colors.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            ✕ Report Failed
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 1.6 }}>
            {error}
          </div>
          <button onClick={fetchReport} style={{
            marginTop: 12, padding: '6px 16px', background: colors.panel,
            border: `1px solid ${colors.border}`, borderRadius: 5,
            fontFamily: fonts.mono, fontSize: 11, cursor: 'pointer', color: colors.textPrimary,
          }}>Retry</button>
        </div>
      )}

      {/* ── Report content ── */}
      {!loading && !error && report && (() => {
        const tp = report.correctly_flagged ?? 0;
        const fp = report.false_alarms ?? 0;
        const fn = report.missed ?? 0;
        const tn = (report.total_merchants ?? 0) - tp - fp - fn;
        const pGrade = grade(report.precision);
        const rGrade = grade(report.recall);

        const pieData = [
          { name: 'True Pos',   value: tp, color: colors.teal  },
          { name: 'False Alarm',value: fp, color: colors.amber },
          { name: 'Missed',     value: fn, color: colors.red   },
          { name: 'True Neg',   value: tn, color: colors.muted },
        ].filter(d => d.value > 0);

        const exceptions = report.exceptions ?? [];
        const fpList  = exceptions.filter(e => e.reason?.startsWith('False alarm'));
        const fnList  = exceptions.filter(e => e.reason?.startsWith('Missed'));
        const tpDivList = exceptions.filter(e => e.reason?.startsWith('True positive'));

        return (
          <>
            {/* ── Row 1: Score cards + donut ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr', gap: 16, marginBottom: 20 }}>

              {/* Precision */}
              <ScoreCard
                label="Precision"
                sublabel="TP / (TP + FP)"
                value={report.precision != null ? `${(report.precision * 100).toFixed(1)}%` : '—'}
                grade={pGrade}
                bar={report.precision ?? 0}
              />

              {/* Recall */}
              <ScoreCard
                label="Recall"
                sublabel="TP / (TP + FN)"
                value={report.recall != null ? `${(report.recall * 100).toFixed(1)}%` : '—'}
                grade={rGrade}
                bar={report.recall ?? 0}
              />

              {/* Count grid */}
              <div style={{
                background: colors.panel, border: `1px solid ${colors.border}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                  fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textDim,
                }}>Counts</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {[
                    { label: 'Total',    value: report.total_merchants,    color: colors.textPrimary },
                    { label: 'Planted',  value: report.planted_shortfalls, color: colors.amber       },
                    { label: 'Caught',   value: tp,                        color: colors.teal        },
                    { label: 'Missed',   value: fn,                        color: fn > 0 ? colors.red : colors.textDim },
                    { label: 'F. Alarm', value: fp,                        color: fp > 0 ? colors.amber : colors.textDim },
                    { label: 'True Neg', value: tn,                        color: colors.textSecondary },
                  ].map((item, i) => (
                    <div key={i} style={{
                      padding: '10px 14px',
                      borderRight: i % 2 === 0 ? `1px solid ${colors.border}` : 'none',
                      borderBottom: i < 4 ? `1px solid ${colors.border}` : 'none',
                    }}>
                      <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.textDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                        {item.label}
                      </div>
                      <div style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 700, color: item.color, lineHeight: 1 }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Donut chart */}
              <div style={{
                background: colors.panel, border: `1px solid ${colors.border}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                  fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textDim,
                }}>Prediction Breakdown</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', gap: 12 }}>
                  <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={52} paddingAngle={3} dataKey="value">
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip
                          formatter={(val, name) => [val, name]}
                          contentStyle={{ fontFamily: fonts.mono, fontSize: 11, border: `1px solid ${colors.border}`, borderRadius: 6 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pieData.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary }}>
                          {d.name}
                        </span>
                        <span style={{ fontFamily: fonts.mono, fontSize: 11, fontWeight: 700, color: d.color, marginLeft: 'auto' }}>
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Row 2: Confusion matrix + grade badges ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, marginBottom: 20, alignItems: 'start' }}>

              {/* Confusion matrix */}
              <div style={{
                background: colors.panel, border: `1px solid ${colors.border}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                  fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textDim,
                }}>Confusion Matrix</div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 110px 110px', gap: 3 }}>
                    {/* Header */}
                    <div />
                    <CmHead label="Predicted +" />
                    <CmHead label="Predicted –" />
                    {/* Row 1 */}
                    <CmHead label="Actual +" style={{ textAlign: 'right' }} />
                    <CmCell value={tp} label="True Positive"  color={colors.teal}  bg={colors.tealBg}  />
                    <CmCell value={fn} label="False Negative" color={colors.red}   bg={colors.redBg}   />
                    {/* Row 2 */}
                    <CmHead label="Actual –" style={{ textAlign: 'right' }} />
                    <CmCell value={fp} label="False Positive" color={colors.amber} bg={colors.amberBg} />
                    <CmCell value={tn} label="True Negative"  color={colors.textSecondary} bg={colors.lift} />
                  </div>
                </div>
              </div>

              {/* Summary card */}
              <div style={{
                background: colors.panel, border: `1px solid ${colors.border}`,
                borderRadius: 10, overflow: 'hidden', height: '100%',
              }}>
                <div style={{
                  padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                  fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textDim,
                }}>Model Performance</div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                    <GradeBadge label="Precision" grade={pGrade} pct={report.precision} />
                    <GradeBadge label="Recall"    grade={rGrade} pct={report.recall}    />
                  </div>
                  <div style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 1.7, borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
                    The engine used a <strong>weekday-smoothed exponential model</strong> on {report.total_merchants} merchants.{' '}
                    It correctly caught <strong style={{ color: colors.teal }}>{tp}</strong> of {report.planted_shortfalls} planted shortfalls,
                    missed <strong style={{ color: fn > 0 ? colors.red : colors.textSecondary }}>{fn}</strong>, and
                    raised <strong style={{ color: fp > 0 ? colors.amber : colors.textSecondary }}>{fp}</strong> false alarm{fp !== 1 ? 's' : ''}.
                    {exceptions.length > 0 && ` ${exceptions.length} cases surfaced as exceptions below.`}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Exceptions ── */}
            {exceptions.length > 0 && (
              <div style={{
                background: colors.panel, border: `1px solid ${colors.border}`,
                borderRadius: 10, overflow: 'hidden', marginBottom: 20,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', borderBottom: `1px solid ${colors.border}`,
                }}>
                  <span style={{
                    fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textDim,
                  }}>
                    Exceptions  ·  {exceptions.length} cases
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {tpDivList.length > 0 && <ExcBadge count={tpDivList.length} label="TP divergence" color={colors.teal} />}
                    {fnList.length  > 0 && <ExcBadge count={fnList.length}  label="missed"        color={colors.red}  />}
                    {fpList.length  > 0 && <ExcBadge count={fpList.length}  label="false alarms"  color={colors.amber}/>}
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: colors.lift }}>
                        {['Type', 'Merchant', 'Reason'].map(h => (
                          <th key={h} style={{
                            padding: '8px 14px', textAlign: 'left',
                            fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            color: colors.textDim, borderBottom: `1px solid ${colors.border}`,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map((ex, i) => {
                        const isFP = ex.reason?.startsWith('False alarm');
                        const isFN = ex.reason?.startsWith('Missed');
                        const isTP = ex.reason?.startsWith('True positive');
                        const typeColor = isFP ? colors.amber : isFN ? colors.red : colors.teal;
                        const typeLabel = isFP ? 'FALSE ALARM' : isFN ? 'MISSED' : 'TP DIVERGE';
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? colors.panel : colors.lift }}>
                            <td style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>
                              <span style={{
                                fontFamily: fonts.mono, fontSize: 9, fontWeight: 700,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                color: typeColor, background: `${typeColor}18`,
                                border: `1px solid ${typeColor}40`,
                                borderRadius: 3, padding: '2px 6px',
                              }}>{typeLabel}</span>
                            </td>
                            <td style={{
                              padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                              fontFamily: fonts.mono, fontSize: 12, fontWeight: 600,
                              color: colors.cyanLight, whiteSpace: 'nowrap',
                            }}>{ex.merchant_id}</td>
                            <td style={{
                              padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
                              fontFamily: fonts.body, fontSize: 12,
                              color: colors.textSecondary, lineHeight: 1.6,
                              maxWidth: 560,
                            }}>{ex.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {exceptions.length === 0 && (
              <div style={{
                padding: '20px 24px', background: colors.tealBg,
                border: `1px solid ${colors.tealDim}`, borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 12,
                fontFamily: fonts.mono, fontSize: 12, color: colors.tealLight,
              }}>
                <span style={{ fontSize: 18 }}>✓</span>
                No exceptions — all predictions matched ground truth exactly
              </div>
            )}
          </>
        );
      })()}

      {!loading && !error && !report && (
        <div style={{
          padding: 60, textAlign: 'center',
          fontFamily: fonts.mono, fontSize: 12, color: colors.textDim,
        }}>
          No accuracy report available. Click Re-run Report above.
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ScoreCard({ label, sublabel, value, grade, bar }) {
  return (
    <div style={{
      background: colors.panel, border: `1px solid ${colors.border}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${colors.border}`,
        fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textDim,
      }}>{label}</div>
      <div style={{ padding: '16px 14px' }}>
        <div style={{
          fontFamily: fonts.mono, fontSize: 40, fontWeight: 800,
          color: grade.color, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 6,
        }}>{value}</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.textDim, letterSpacing: '0.04em', marginBottom: 12 }}>
          {sublabel}
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: colors.border, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.round(bar * 100)}%`,
            background: grade.color, borderRadius: 2,
            transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center',
          fontFamily: fonts.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: grade.color, background: `${grade.color}18`,
          border: `1px solid ${grade.color}40`,
          borderRadius: 3, padding: '2px 7px',
        }}>{grade.label}</div>
      </div>
    </div>
  );
}

function CmHead({ label, style: extraStyle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      fontFamily: fonts.mono, fontSize: 9, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: colors.textDim, padding: '4px 0',
      ...extraStyle,
    }}>{label}</div>
  );
}

function CmCell({ value, label, color, bg }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}30`,
      borderRadius: 6, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontFamily: fonts.mono, fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.textDim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

function GradeBadge({ label, grade, pct }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.textDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 22, fontWeight: 800, color: grade.color, lineHeight: 1 }}>
          {pct != null ? `${(pct * 100).toFixed(1)}%` : '—'}
        </span>
        <span style={{
          fontFamily: fonts.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: grade.color, background: `${grade.color}18`,
          border: `1px solid ${grade.color}40`,
          borderRadius: 3, padding: '2px 6px',
        }}>{grade.label}</span>
      </div>
    </div>
  );
}

function ExcBadge({ count, label, color }) {
  return (
    <span style={{
      fontFamily: fonts.mono, fontSize: 10, fontWeight: 600,
      color, background: `${color}14`, border: `1px solid ${color}40`,
      borderRadius: 3, padding: '2px 8px', letterSpacing: '0.04em',
    }}>
      {count} {label}
    </span>
  );
}
