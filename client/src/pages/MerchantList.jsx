import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { getMerchants, triggerForecastAll } from '../api.js';
import RunwayGauge from '../components/RunwayGauge.jsx';
import { formatMoney, formatDate } from '../utils/formatMoney.js';
import { colors, fonts } from '../theme.js';

function deriveRunway(cashHealth, daily_projected_balance) {
  if (!cashHealth) return null;
  if (cashHealth.shortfall_detected && cashHealth.shortfall_date) {
    const diff = Math.floor((new Date(cashHealth.shortfall_date) - new Date()) / 86400000);
    return Math.max(0, diff);
  }
  // Healthy: use the actual projection length if available, otherwise cap at 14
  if (daily_projected_balance?.length > 0) return daily_projected_balance.length;
  return 14;
}

function SparkLine({ data = [] }) {
  if (!data || data.length < 2) {
    return (
      <div style={{
        height:40, display:'flex', alignItems:'center', justifyContent:'center',
        background:colors.lift, borderRadius:4,
        fontFamily:fonts.mono, fontSize:10, color:colors.textDim,
      }}>
        no forecast
      </div>
    );
  }
  const chartData = data.map((d) => ({ v: d.balance_paise }));
  const hasNeg = chartData.some((d) => d.v < 0);
  return (
    <div style={{ width:'100%', height:40 }}>
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={chartData} margin={{ top:3, right:0, left:0, bottom:0 }}>
          <Line type="monotone" dataKey="v"
            stroke={hasNeg ? colors.red : colors.cyan}
            strokeWidth={1.5} dot={false} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MerchantCard({ merchant, onSelect }) {
  const { cash_health, daily_projected_balance } = merchant;
  const shortfall = cash_health?.shortfall_detected;
  const noForecast = !cash_health;
  const runway = deriveRunway(cash_health, daily_projected_balance);

  return (
    <button onClick={onSelect} style={{
      display:'flex', flexDirection:'column', gap:12,
      padding:18, background:colors.panel,
      border:`1.5px solid ${shortfall ? colors.red : noForecast ? colors.border : colors.border}`,
      borderLeft:`4px solid ${shortfall ? colors.red : noForecast ? colors.muted : colors.teal}`,
      borderRadius:10, cursor:'pointer', textAlign:'left', width:'100%',
      transition:'all 0.15s',
      boxShadow: shortfall ? '0 2px 8px rgba(220,38,38,0.10)' : '0 1px 4px rgba(0,0,0,0.05)',
    }}
    onMouseEnter={(e)=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.10)'; e.currentTarget.style.transform='translateY(-1px)'; }}
    onMouseLeave={(e)=>{ e.currentTarget.style.boxShadow=shortfall?'0 2px 8px rgba(220,38,38,0.10)':'0 1px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.transform='translateY(0)'; }}
    aria-label={`View ${merchant.name}`}>

      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <RunwayGauge daysOfRunway={runway} size={84} label="days"/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontFamily:fonts.display, fontSize:14, fontWeight:600,
            color:colors.textPrimary, marginBottom:3,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>
            {merchant.name}
          </div>
          <div style={{
            fontFamily:fonts.mono, fontSize:10, color:colors.textSecondary,
            letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6,
          }}>
            {merchant.business_type} · {merchant.employees_count} emp
          </div>

          {shortfall && cash_health?.shortfall_date ? (
            <div style={{
              display:'inline-flex', alignItems:'center', gap:5,
              fontSize:11, fontFamily:fonts.mono, fontWeight:600,
              color:colors.red, background:colors.redBg,
              border:`1px solid ${colors.redDim}`, borderRadius:4, padding:'2px 8px',
            }}>
              ⚠ Shortfall {formatDate(cash_health.shortfall_date)} · {formatMoney(cash_health.shortfall_amount_paise, { compact:true })}
            </div>
          ) : noForecast ? (
            <div style={{
              display:'inline-flex', alignItems:'center', gap:5,
              fontSize:11, fontFamily:fonts.mono,
              color:colors.textDim, background:colors.lift,
              border:`1px solid ${colors.border}`, borderRadius:4, padding:'2px 8px',
            }}>
              — no forecast yet
            </div>
          ) : (
            <div style={{
              display:'inline-flex', alignItems:'center', gap:5,
              fontSize:11, fontFamily:fonts.mono, fontWeight:600,
              color:colors.teal, background:colors.tealBg,
              border:`1px solid ${colors.tealDim}`, borderRadius:4, padding:'2px 8px',
            }}>
              ✓ Healthy · {runway ?? 14}-day runway clear
            </div>
          )}
        </div>
      </div>

      <SparkLine data={daily_projected_balance}/>
    </button>
  );
}

export default function MerchantList({ onSelectMerchant }) {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('all'); // 'all' | 'shortfall' | 'healthy'
  const [forecasting, setForecasting] = useState(false);
  const [forecastMsg, setForecastMsg] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    getMerchants()
      .then((res) => { setMerchants(res.data); setLoading(false); })
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  async function handleForecastAll() {
    setForecasting(true);
    setForecastMsg(null);
    try {
      const res = await triggerForecastAll();
      const results = res.data ?? [];
      const errCount = results.filter((r) => r.error).length;
      setForecastMsg({
        text: errCount === 0
          ? `✓ Forecasts updated for all ${results.length} merchants`
          : `⚠ ${results.length - errCount}/${results.length} forecasts updated (${errCount} failed)`,
        isError: errCount > 0,
      });
      load(); // reload the list with fresh cash_health
    } catch (err) {
      const raw = err.response?.data?.error || err.message || '';
      setForecastMsg({
        text: raw.toLowerCase().includes('ai service') || raw.toLowerCase().includes('502')
          ? 'AI service is offline — start it with: cd ai-service && uvicorn main:app --reload'
          : raw || 'Forecast run failed',
        isError: true,
      });
    } finally {
      setForecasting(false);
    }
  }

  const shortfallCount = merchants.filter((m) => m.cash_health?.shortfall_detected).length;
  const healthyCount   = merchants.filter((m) => m.cash_health && !m.cash_health.shortfall_detected).length;

  const filtered = merchants.filter((m) => {
    if (filter === 'shortfall') return m.cash_health?.shortfall_detected;
    if (filter === 'healthy')   return m.cash_health && !m.cash_health.shortfall_detected;
    return true;
  });

  return (
    <div style={{ padding:24, maxWidth:1400, margin:'0 auto' }}>

      {/* Header */}
      <div style={{
        display:'flex', alignItems:'flex-start', justifyContent:'space-between',
        marginBottom: forecastMsg ? 12 : 24, flexWrap:'wrap', gap:12,
      }}>
        <div>
          <h1 style={{
            fontFamily:fonts.display, fontSize:24, fontWeight:700,
            color:colors.textPrimary, letterSpacing:'-0.02em', marginBottom:6,
          }}>
            Merchant Fleet
          </h1>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontFamily:fonts.mono, fontSize:12, color:colors.textSecondary }}>
              {merchants.length} merchants
            </span>
            {shortfallCount > 0 && (
              <span style={{
                fontFamily:fonts.mono, fontSize:12, fontWeight:600,
                color:colors.red, background:colors.redBg,
                border:`1px solid ${colors.redDim}`, borderRadius:4, padding:'1px 8px',
              }}>
                {shortfallCount} shortfall{shortfallCount!==1?'s':''} detected
              </span>
            )}
            {healthyCount > 0 && (
              <span style={{
                fontFamily:fonts.mono, fontSize:12,
                color:colors.teal, background:colors.tealBg,
                border:`1px solid ${colors.tealDim}`, borderRadius:4, padding:'1px 8px',
              }}>
                {healthyCount} healthy
              </span>
            )}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {/* Run all forecasts button */}
          <button
            onClick={handleForecastAll}
            disabled={forecasting || loading}
            style={{
              padding:'6px 14px', borderRadius:6, fontSize:12,
              fontFamily:fonts.mono, fontWeight:600,
              background: forecasting ? colors.lift : colors.cyan,
              border:`1px solid ${forecasting ? colors.border : colors.cyan}`,
              color: forecasting ? colors.textSecondary : '#fff',
              cursor: forecasting || loading ? 'not-allowed' : 'pointer',
              opacity: forecasting || loading ? 0.7 : 1,
              transition:'all 0.15s',
              letterSpacing:'0.04em',
            }}
          >
            {forecasting ? '↻ Running Forecasts…' : '↻ Run All Forecasts'}
          </button>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:4 }}>
            {[
              { key:'all',       label:`All (${merchants.length})` },
              { key:'shortfall', label:`⚠ Shortfall (${shortfallCount})` },
              { key:'healthy',   label:`✓ Healthy (${healthyCount})` },
            ].map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding:'5px 12px', borderRadius:6, fontSize:12,
                fontFamily:fonts.mono, fontWeight: filter===f.key?600:400,
                background: filter===f.key ? colors.cyan : colors.panel,
                border:`1px solid ${filter===f.key ? colors.cyan : colors.border}`,
                color: filter===f.key ? '#fff' : colors.textSecondary,
                cursor:'pointer', transition:'all 0.15s',
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Forecast status message */}
      {forecastMsg && (
        <div style={{
          marginBottom:16, padding:'10px 16px',
          background: forecastMsg.isError ? colors.redBg : colors.tealBg,
          border:`1px solid ${forecastMsg.isError ? colors.redDim : colors.tealDim}`,
          borderLeft:`3px solid ${forecastMsg.isError ? colors.red : colors.teal}`,
          borderRadius:6, fontFamily:fonts.mono, fontSize:12,
          color: forecastMsg.isError ? colors.redLight : colors.tealLight,
        }}>
          {forecastMsg.text}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {Array.from({ length:8 }).map((_,i) => (
            <div key={i} style={{
              padding:18, background:colors.panel,
              border:`1px solid ${colors.border}`, borderRadius:10,
              display:'flex', flexDirection:'column', gap:12,
            }}>
              <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                <div style={{ width:84, height:84, borderRadius:'50%', background:colors.lift, flexShrink:0 }}/>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ height:13, background:colors.lift, borderRadius:3, width:'70%' }}/>
                  <div style={{ height:10, background:colors.lift, borderRadius:3, width:'50%' }}/>
                  <div style={{ height:18, background:colors.lift, borderRadius:4, width:'60%' }}/>
                </div>
              </div>
              <div style={{ height:40, background:colors.lift, borderRadius:4 }}/>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding:'16px 20px', background:colors.redBg,
          border:`1px solid ${colors.redDim}`, borderLeft:`4px solid ${colors.red}`,
          borderRadius:8,
        }}>
          <div style={{ fontFamily:fonts.mono, fontSize:12, fontWeight:600, color:colors.red, marginBottom:4 }}>
            ✕ Failed to load merchants
          </div>
          <div style={{ fontFamily:fonts.body, fontSize:13, color:colors.textSecondary }}>
            {error}
          </div>
          <button onClick={load} style={{
            marginTop:10, padding:'5px 14px', background:colors.panel,
            border:`1px solid ${colors.border}`, borderRadius:5,
            fontFamily:fonts.mono, fontSize:11, cursor:'pointer', color:colors.textPrimary,
          }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {filtered.map((m) => (
            <MerchantCard key={m.merchant_id} merchant={m}
              onSelect={() => onSelectMerchant(m.merchant_id, m.name)}/>
          ))}
          {filtered.length === 0 && (
            <div style={{
              gridColumn:'1/-1', padding:40, textAlign:'center',
              fontFamily:fonts.mono, fontSize:13, color:colors.textDim,
            }}>
              No merchants match this filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
