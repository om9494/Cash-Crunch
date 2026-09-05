import { colors, fonts } from '../theme.js';

const TABS = [
  { id: 'fleet',    label: 'Fleet' },
  { id: 'accuracy', label: 'Diagnostics' },
];

export default function NavBar({ activeTab, onTabChange, merchantName }) {
  return (
    <header style={{
      position:'sticky', top:0, zIndex:100,
      background: '#FFFFFF',
      borderBottom:`1px solid ${colors.border}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      display:'flex', alignItems:'center',
      padding:'0 24px', height:52, gap:0,
    }}>
      {/* Logo + wordmark */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginRight:32, flexShrink:0 }}>
        <div style={{
          width:28, height:28, borderRadius:6,
          background: colors.cyan,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 11 L7 3 L11 11" stroke="#fff" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4.5 8.5 H9.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ fontFamily:fonts.display, fontSize:14, fontWeight:700,
          color:colors.textPrimary, letterSpacing:'-0.01em' }}>
          Cash Crunch Autopilot
        </span>
      </div>

      {/* Breadcrumb */}
      {merchantName && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:20, overflow:'hidden' }}>
          <span style={{ color:colors.textDim, fontSize:14 }}>›</span>
          <span style={{ fontFamily:fonts.mono, fontSize:12, color:colors.textSecondary,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {merchantName}
          </span>
        </div>
      )}

      <div style={{ flex:1 }} />

      <nav role="tablist" style={{ display:'flex', gap:2, height:'100%', alignItems:'center' }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} role="tab" aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              style={{
                padding:'5px 14px', height:34,
                background: active ? colors.cyan : 'transparent',
                border: active ? `1px solid ${colors.cyan}` : `1px solid transparent`,
                borderRadius:6, cursor:'pointer',
                fontFamily:fonts.mono, fontSize:11, fontWeight:active?600:400,
                letterSpacing:'0.06em', textTransform:'uppercase',
                color: active ? '#fff' : colors.textSecondary,
                transition:'all 0.15s',
              }}
              onMouseEnter={(e) => { if(!active){ e.currentTarget.style.background=colors.lift; e.currentTarget.style.borderColor=colors.border; }}}
              onMouseLeave={(e) => { if(!active){ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='transparent'; }}}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
