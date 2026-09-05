import { useEffect, useState } from 'react';
import { getAccuracyReport } from '../api.js';
import { formatDate } from '../utils/formatMoney.js';
import { colors, fonts } from '../theme.js';

/**
 * AccuracyReport — systems-diagnostics screen.
 * Shows precision/recall as large monospace instrument readouts.
 * Exceptions table below.
 */
export default function AccuracyReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    getAccuracyReport()
      .then((res) => { setReport(res.data); setLoading(false); })
      .catch((err) => {
        setError(err.response?.data?.error || err.message || 'Failed to load accuracy report');
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: '10px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: colors.cyan,
            marginBottom: '6px',
          }}
        >
          system diagnostics
        </div>
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: '22px',
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          Forecast Accuracy Report
        </h1>
        {report?.generated_at && (
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: '11px',
              color: colors.textDim,
              marginTop: '4px',
            }}
          >
            run_id: {report.run_id} · generated {formatDate(report.generated_at, 'long')}
          </div>
        )}
      </div>

      {loading && <LoadingScreen />}
      {error && <ErrorPanel message={error} />}

      {!loading && !error && report && (
        <>
          {/* Primary instrument row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1px',
              background: colors.border,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '24px',
            }}
          >
            <Instrument
              label="Precision"
              value={report.precision != null ? `${(report.precision * 100).toFixed(1)}%` : '—'}
              color={precisionColor(report.precision)}
              sublabel="true positives / (TP + FP)"
            />
            <Instrument
              label="Recall"
              value={report.recall != null ? `${(report.recall * 100).toFixed(1)}%` : '—'}
              color={recallColor(report.recall)}
              sublabel="true positives / (TP + FN)"
            />
            <Instrument
              label="Merchants"
              value={report.total_merchants ?? '—'}
              color={colors.textSecondary}
              sublabel="total evaluated"
            />
            <Instrument
              label="Planted"
              value={report.planted_shortfalls ?? '—'}
              color={colors.amber}
              sublabel="ground-truth shortfalls"
            />
            <Instrument
              label="Caught"
              value={report.correctly_flagged ?? '—'}
              color={colors.teal}
              sublabel="correctly flagged"
            />
            <Instrument
              label="Missed"
              value={report.missed ?? '—'}
              color={report.missed > 0 ? colors.red : colors.textDim}
              sublabel="false negatives"
            />
            <Instrument
              label="False Alarms"
              value={report.false_alarms ?? '—'}
              color={report.false_alarms > 0 ? colors.amber : colors.textDim}
              sublabel="false positives"
            />
          </div>

          {/* Confusion matrix visual */}
          <ConfusionMatrix report={report} />

          {/* Exceptions table */}
          {report.exceptions?.length > 0 && (
            <Section label={`Exceptions  ·  ${report.exceptions.length} cases`}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: fonts.mono,
                  fontSize: '12px',
                }}
              >
                <thead>
                  <tr>
                    {['Merchant ID', 'Reason'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '6px 12px',
                          borderBottom: `1px solid ${colors.border}`,
                          fontWeight: 500,
                          fontSize: '10px',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.textDim,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.exceptions.map((ex, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : colors.lift,
                      }}
                    >
                      <td
                        style={{
                          padding: '9px 12px',
                          borderBottom: `1px solid ${colors.border}`,
                          color: colors.cyanLight,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ex.merchant_id}
                      </td>
                      <td
                        style={{
                          padding: '9px 12px',
                          borderBottom: `1px solid ${colors.border}`,
                          color: colors.textSecondary,
                          lineHeight: 1.5,
                        }}
                      >
                        {ex.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {(!report.exceptions || report.exceptions.length === 0) && (
            <div
              style={{
                padding: '20px',
                background: colors.tealBg,
                border: `1px solid ${colors.tealDim}`,
                borderRadius: '8px',
                fontFamily: fonts.mono,
                fontSize: '12px',
                color: colors.tealLight,
                textAlign: 'center',
              }}
            >
              ✓ No exceptions — all predictions matched ground truth
            </div>
          )}
        </>
      )}

      {!loading && !error && !report && (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            fontFamily: fonts.mono,
            fontSize: '12px',
            color: colors.textDim,
          }}
        >
          No accuracy report available. Run the forecasting job first.
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Instrument({ label, value, color, sublabel }) {
  return (
    <div
      style={{
        background: colors.panel,
        padding: '20px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: '10px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: colors.textDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: '32px',
          fontWeight: 600,
          color,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: '9px',
          color: colors.textDim,
          letterSpacing: '0.04em',
          marginTop: '2px',
        }}
      >
        {sublabel}
      </div>
    </div>
  );
}

function ConfusionMatrix({ report }) {
  const tp = report.correctly_flagged ?? 0;
  const fp = report.false_alarms ?? 0;
  const fn = report.missed ?? 0;
  const tn = (report.total_merchants ?? 0) - tp - fp - fn;

  return (
    <Section label="Confusion Matrix">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr 1fr',
          gap: '1px',
          background: colors.border,
          border: `1px solid ${colors.border}`,
          borderRadius: '6px',
          overflow: 'hidden',
          maxWidth: '420px',
        }}
      >
        {/* Header row */}
        <div style={cmCell(colors.panel)} />
        <div style={{ ...cmCell(colors.panel), fontFamily: fonts.mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textDim, textAlign: 'center' }}>
          Predicted +
        </div>
        <div style={{ ...cmCell(colors.panel), fontFamily: fonts.mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textDim, textAlign: 'center' }}>
          Predicted –
        </div>

        {/* Actual + row */}
        <div style={{ ...cmCell(colors.panel), fontFamily: fonts.mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textDim }}>
          Actual +
        </div>
        <CMValue value={tp} label="TP" color={colors.teal} />
        <CMValue value={fn} label="FN" color={colors.red} />

        {/* Actual – row */}
        <div style={{ ...cmCell(colors.panel), fontFamily: fonts.mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textDim }}>
          Actual –
        </div>
        <CMValue value={fp} label="FP" color={colors.amber} />
        <CMValue value={tn} label="TN" color={colors.textSecondary} />
      </div>
    </Section>
  );
}

function cmCell(bg) {
  return {
    background: bg,
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
  };
}

function CMValue({ value, label, color }) {
  return (
    <div
      style={{
        background: colors.lift,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
      }}
    >
      <span style={{ fontFamily: fonts.mono, fontSize: '24px', fontWeight: 600, color, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontFamily: fonts.mono, fontSize: '9px', color: colors.textDim, letterSpacing: '0.08em' }}>
        {label}
      </span>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div
      style={{
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${colors.border}`,
          fontFamily: fonts.mono,
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: colors.textDim,
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1px',
        background: colors.border,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: colors.panel,
            padding: '20px',
            height: '90px',
          }}
        >
          <div style={{ height: '8px', background: colors.lift, borderRadius: '2px', marginBottom: '10px', width: '40%' }} />
          <div style={{ height: '32px', background: colors.lift, borderRadius: '2px', width: '60%' }} />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ message }) {
  return (
    <div
      style={{
        padding: '16px 20px',
        background: colors.redBg,
        border: `1px solid ${colors.redDim}`,
        borderRadius: '8px',
        color: colors.redLight,
        fontFamily: fonts.mono,
        fontSize: '13px',
      }}
    >
      {message}
    </div>
  );
}

// Color helpers based on value quality
function precisionColor(v) {
  if (v === null || v === undefined) return colors.textDim;
  if (v >= 0.85) return colors.teal;
  if (v >= 0.65) return colors.amber;
  return colors.red;
}

function recallColor(v) {
  if (v === null || v === undefined) return colors.textDim;
  if (v >= 0.85) return colors.teal;
  if (v >= 0.65) return colors.amber;
  return colors.red;
}
