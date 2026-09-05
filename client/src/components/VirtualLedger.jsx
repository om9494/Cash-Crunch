import { useEffect, useState } from 'react';
import { getVirtualAccount, getPlatformBalance } from '../api.js';
import StatusBadge from './StatusBadge.jsx';
import { formatMoney, formatDate } from '../utils/formatMoney.js';
import { colors, fonts } from '../theme.js';

/**
 * VirtualLedger — shows the merchant's RazorpayX fund account and payout history.
 * SYNTHETIC: models RazorpayX Fund Account + Payout shape.
 */
export default function VirtualLedger({ merchantId, refreshTrigger }) {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  // SYNTHETIC: platform balance — models RazorpayX current account balance
  const [platformBal, setPlatformBal] = useState(null);

  useEffect(() => {
    if (!merchantId) return;
    setLoading(true);
    setError(null);
    // Fetch virtual account + platform balance in parallel
    Promise.all([
      getVirtualAccount(merchantId),
      getPlatformBalance().catch(() => null), // non-fatal if platform balance missing
    ]).then(([vaRes, pbRes]) => {
      setData(vaRes.data);
      if (pbRes) setPlatformBal(pbRes.data.balance_paise);
      setLoading(false);
    }).catch((err) => {
      setError(err.response?.data?.error || 'Failed to load virtual account');
      setLoading(false);
    });
  }, [merchantId, refreshTrigger]);

  return (
    <div style={{
      background: colors.panel,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 16px', borderBottom:`1px solid ${colors.border}`,
        background: colors.lift,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            width:8, height:8, borderRadius:'50%',
            background: data ? colors.teal : colors.textDim,
          }}/>
          <span style={{
            fontFamily:fonts.mono, fontSize:11, fontWeight:600,
            letterSpacing:'0.08em', textTransform:'uppercase',
            color: colors.textPrimary,
          }}>
            Virtual Fund Account
          </span>
        </div>
        <span style={{
          fontFamily:fonts.mono, fontSize:9, letterSpacing:'0.08em',
          textTransform:'uppercase', color:colors.textDim,
          background: colors.panel, border:`1px solid ${colors.border}`,
          borderRadius:3, padding:'1px 5px',
        }} title="SYNTHETIC: models RazorpayX shape, no public sandbox">
          SYNTHETIC
        </span>
      </div>

      {loading && (
        <div style={{ padding:20 }}>
          {[70,50,40].map((w,i) => (
            <div key={i} style={{
              height:12, background:colors.lift, borderRadius:3,
              width:`${w}%`, marginBottom:10,
            }}/>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding:'20px 16px' }}>
          <div style={{
            padding:'12px 14px', background:colors.lift,
            border:`1px solid ${colors.border}`, borderRadius:8,
            fontFamily:fonts.mono, fontSize:12, color:colors.textSecondary,
            lineHeight:1.6,
          }}>
            <div style={{ fontWeight:600, color:colors.textPrimary, marginBottom:4 }}>
              No virtual account found
            </div>
            {error}
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Account details */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
            gap:0, borderBottom:`1px solid ${colors.border}`,
          }}>
            {[
              { label:'Account Number', value: data.fund_account?.account_number_masked ?? '——' },
              { label:'IFSC', value: data.fund_account?.ifsc ?? '——' },
              { label:'Fund Account ID', value: data.fund_account?.fund_account_id ?? '——' },
            ].map((item, i) => (
              <div key={i} style={{
                padding:'14px 16px',
                borderRight: i < 2 ? `1px solid ${colors.border}` : 'none',
              }}>
                <div style={{
                  fontFamily:fonts.mono, fontSize:10, color:colors.textDim,
                  letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4,
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontFamily:fonts.mono, fontSize: i===0?15:12,
                  fontWeight:600, color: i===0?colors.cyan:colors.textPrimary,
                  letterSpacing: i===0?'0.08em':'0.02em',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Platform balance — SYNTHETIC: models RazorpayX current account */}
          {platformBal != null && (
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 16px', background:colors.lift,
              borderBottom:`1px solid ${colors.border}`,
            }}>
              <span style={{
                fontFamily:fonts.mono, fontSize:10, color:colors.textDim,
                letterSpacing:'0.08em', textTransform:'uppercase',
              }}>
                Platform Reserve Balance
                <span style={{
                  marginLeft:6, fontSize:9, color:colors.textDim,
                  background:colors.lift, border:`1px solid ${colors.border}`,
                  borderRadius:2, padding:'0 4px',
                }} title="SYNTHETIC: models RazorpayX shape, no public sandbox">SYNTHETIC</span>
              </span>
              <span style={{
                fontFamily:fonts.mono, fontSize:14, fontWeight:700,
                color: platformBal > 1_000_000 ? colors.teal : colors.amber,
              }}>
                {formatMoney(platformBal, { compact: true })}
              </span>
            </div>
          )}

          {/* Payout history */}
          <div>
            <div style={{
              display:'grid', gridTemplateColumns:'1.2fr 1fr 0.8fr 1fr',
              padding:'8px 16px', borderBottom:`1px solid ${colors.border}`,
              background: colors.lift,
            }}>
              {['Date', 'Amount', 'Purpose', 'Status'].map((h) => (
                <span key={h} style={{
                  fontFamily:fonts.mono, fontSize:10, fontWeight:600,
                  color:colors.textDim, letterSpacing:'0.08em', textTransform:'uppercase',
                }}>{h}</span>
              ))}
            </div>

            {(!data.payouts || data.payouts.length === 0) && (
              <div style={{
                padding:'24px 16px', textAlign:'center',
                fontFamily:fonts.mono, fontSize:12, color:colors.textDim,
              }}>
                No payouts yet — approve a recommendation to trigger one
              </div>
            )}

            {data.payouts?.map((p, i) => (
              <div key={p.payout_id ?? i} style={{
                display:'grid', gridTemplateColumns:'1.2fr 1fr 0.8fr 1fr',
                padding:'10px 16px', alignItems:'center',
                borderBottom: i < data.payouts.length-1 ? `1px solid ${colors.border}` : 'none',
                background: i%2===0 ? colors.panel : colors.lift,
              }}>
                <span style={{ fontFamily:fonts.mono, fontSize:12, color:colors.textSecondary }}>
                  {formatDate(p.created_at, 'long')}
                </span>
                <span style={{ fontFamily:fonts.mono, fontSize:13, fontWeight:600, color:colors.textPrimary }}>
                  {formatMoney(p.amount_paise, { compact:true })}
                </span>
                <span style={{
                  fontFamily:fonts.mono, fontSize:11,
                  color:colors.textSecondary, textTransform:'capitalize',
                }}>
                  {p.purpose}
                </span>
                <div><StatusBadge status={p.status} variant="payout"/></div>
              </div>
            ))}
          </div>

          {/* UTR for processed payouts */}
          {data.payouts?.some(p => p.utr) && (
            <div style={{
              padding:'10px 16px', background:colors.tealBg,
              borderTop:`1px solid ${colors.tealDim}`,
            }}>
              {data.payouts.filter(p=>p.utr).slice(0,3).map(p=>(
                <div key={p.payout_id} style={{
                  fontFamily:fonts.mono, fontSize:11, color:colors.tealLight,
                  display:'flex', gap:12, marginBottom:2,
                }}>
                  <span style={{ color:colors.textDim }}>UTR</span>
                  <span>{p.utr}</span>
                  <span style={{ color:colors.textDim }}>{formatMoney(p.amount_paise,{compact:true})}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
