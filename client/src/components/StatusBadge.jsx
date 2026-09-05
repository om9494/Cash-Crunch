import { payoutStatusColor, recStatusColor, fonts } from '../theme.js';

export default function StatusBadge({ status, variant = 'payout' }) {
  const map = variant === 'rec' ? recStatusColor : payoutStatusColor;
  const scheme = map[status] ?? { bg:'#F1F3F5', border:'#CED4DA', text:'#6C757D' };

  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'2px 8px', borderRadius:4,
      fontSize:11, fontFamily:fonts.mono, fontWeight:600,
      letterSpacing:'0.05em', textTransform:'uppercase',
      background: scheme.bg, border:`1px solid ${scheme.border}`, color: scheme.text,
    }}>
      <span style={{
        width:5, height:5, borderRadius:'50%',
        background: scheme.border, display:'inline-block', flexShrink:0,
      }}/>
      {status}
    </span>
  );
}
