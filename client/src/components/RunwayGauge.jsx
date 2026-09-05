import { colors, fonts } from '../theme.js';

export default function RunwayGauge({ daysOfRunway, size = 200, label }) {
  const MAX_DAYS = 60;
  const SWEEP    = 220;
  const START    = 160;

  const cx = size / 2;
  const cy = size / 2;
  const r  = (size / 2) * 0.72;
  const strokeW = size * 0.065;

  function polarToXY(angleDeg, radius) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(startDeg, endDeg, radius) {
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const redEnd   = START + SWEEP * (7  / MAX_DAYS);
  const amberEnd = START + SWEEP * (21 / MAX_DAYS);
  const arcEnd   = START + SWEEP;

  const clamped   = Math.max(0, Math.min(daysOfRunway ?? 0, MAX_DAYS));
  const needleDeg = START + SWEEP * (clamped / MAX_DAYS);

  let zoneColor = colors.gaugeTeal;
  if (daysOfRunway === null || daysOfRunway === undefined) zoneColor = colors.textDim;
  else if (daysOfRunway <= 7)  zoneColor = colors.gaugeRed;
  else if (daysOfRunway <= 21) zoneColor = colors.gaugeAmber;

  const tipRadius  = r * 0.88;
  const tailRadius = r * 0.18;
  const needleTip  = polarToXY(needleDeg, tipRadius);
  const needleTail = polarToXY(needleDeg + 180, tailRadius);
  const perpDeg = needleDeg + 90;
  const perpRad = ((perpDeg - 90) * Math.PI) / 180;
  const bw = size * 0.016;
  const b1 = { x: cx + bw * Math.cos(perpRad), y: cy + bw * Math.sin(perpRad) };
  const b2 = { x: cx - bw * Math.cos(perpRad), y: cy - bw * Math.sin(perpRad) };

  const scaleFontSize = size * 0.075 * 0.82;
  const hasValue = daysOfRunway !== null && daysOfRunway !== undefined;

  const displayDays  = hasValue ? Math.round(daysOfRunway) : '—';
  const displayLabel = label || 'days runway';

  // Font sizes for the below-gauge label
  const numSize   = Math.max(13, size * 0.13);  // the number
  const textSize  = Math.max(9,  size * 0.072); // the "days runway" text

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* ── Gauge SVG — no number inside, just arc + needle ── */}
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        aria-label={`Cash runway: ${displayDays} ${displayLabel}`}
        role="img"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Track */}
        <path d={arcPath(START, arcEnd, r)} fill="none"
          stroke={colors.gaugeTrack} strokeWidth={strokeW} strokeLinecap="round"/>

        {/* Zone tints */}
        <path d={arcPath(START, redEnd, r)} fill="none"
          stroke={colors.gaugeRed} strokeWidth={strokeW} strokeLinecap="butt" opacity="0.2"/>
        <path d={arcPath(redEnd, amberEnd, r)} fill="none"
          stroke={colors.gaugeAmber} strokeWidth={strokeW} strokeLinecap="butt" opacity="0.2"/>
        <path d={arcPath(amberEnd, arcEnd, r)} fill="none"
          stroke={colors.gaugeTeal} strokeWidth={strokeW} strokeLinecap="butt" opacity="0.2"/>

        {/* Active arc */}
        {hasValue && clamped > 0 && (
          <path d={arcPath(START, needleDeg, r)} fill="none"
            stroke={zoneColor} strokeWidth={strokeW} strokeLinecap="round" opacity="0.9"/>
        )}

        {/* Needle */}
        {hasValue && <>
          <line
            x1={needleTail.x} y1={needleTail.y}
            x2={needleTip.x}  y2={needleTip.y}
            stroke={zoneColor} strokeWidth={size * 0.008}
            strokeLinecap="round" opacity="0.5"
          />
          <polygon
            points={`${needleTip.x},${needleTip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
            fill={zoneColor}
          />
        </>}

        {/* Hub */}
        <circle cx={cx} cy={cy} r={size * 0.048} fill={colors.panel}
          stroke={zoneColor} strokeWidth={1.5}/>
        <circle cx={cx} cy={cy} r={size * 0.018} fill={zoneColor} opacity="0.8"/>

        {/* Scale labels */}
        <text
          x={polarToXY(START, r * 1.24).x} y={polarToXY(START, r * 1.24).y}
          textAnchor="middle" fontSize={scaleFontSize} fontFamily={fonts.mono}
          fill={colors.textDim}
        >0</text>
        <text
          x={polarToXY(arcEnd, r * 1.24).x} y={polarToXY(arcEnd, r * 1.24).y}
          textAnchor="middle" fontSize={scaleFontSize} fontFamily={fonts.mono}
          fill={colors.textDim}
        >{MAX_DAYS}</text>
      </svg>

      {/* ── Label below: "6 DAYS RUNWAY" ── */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '0.3em',
        marginTop: -(size * 0.08) + 'px',
        lineHeight: 1,
        textAlign: 'center',
      }}>
        {/* Number */}
        <span style={{
          fontFamily: fonts.mono,
          fontSize: numSize + 'px',
          fontWeight: 800,
          color: zoneColor,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          {displayDays}
        </span>

        {/* "days runway" text */}
        <span style={{
          fontFamily: fonts.mono,
          fontSize: textSize + 'px',
          fontWeight: 700,
          color: zoneColor,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}>
          {displayLabel}
        </span>
      </div>
    </div>
  );
}
