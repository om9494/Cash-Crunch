/**
 * CashCrunch — Marketing Landing Page
 * v2: removed flight-path line overlay (was misaligning over content),
 *     added big hero wordmark, enhanced animations throughout.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion, AnimatePresence } from 'framer-motion';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:         '#F6FAFD',
  bgAlt:      '#E4F1F9',
  primary:    '#1B6FA8',
  deep:       '#12395A',
  warm:       '#E8A94C',
  body:       '#23303B',
  bodyMuted:  '#4A6073',
  border:     '#C8DFF0',
  cardBg:     '#FFFFFF',
  cardShadow: '0 2px 16px rgba(27,111,168,0.08)',
};

const F = {
  display: "'Space Grotesk', 'Inter', sans-serif",
  body:    "'Inter', -apple-system, sans-serif",
  mono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",
};

// ─── Animation variants ───────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] } },
});

const fadeIn = (delay = 0) => ({
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, delay } },
});

const scaleIn = (delay = 0) => ({
  hidden:  { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] } },
});

// staggered children container
const staggerContainer = (staggerDelay = 0.1) => ({
  hidden:  {},
  visible: { transition: { staggerChildren: staggerDelay } },
});

// ─── ScrollReveal wrapper ─────────────────────────────────────────────────────
function Reveal({ children, variants, style, as: Tag = 'div' }) {
  const ref   = useRef(null);
  const inView   = useInView(ref, { once: true, margin: '-50px' });
  const reduced  = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      variants={reduced ? {} : variants}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// staggered grid container
function StaggerGrid({ children, style, stagger = 0.1 }) {
  const ref  = useRef(null);
  const inView  = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      variants={reduced ? {} : staggerContainer(stagger)}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated counter (for numbers section) ───────────────────────────────────
function AnimatedStat({ value, unit, label, sub }) {
  const ref     = useRef(null);
  const inView  = useInView(ref, { once: true, margin: '-30px' });
  const reduced = useReducedMotion();

  // Parse numeric part for counting animation
  const numericMatch = value.replace(/[±%]/g, '').match(/\d+/);
  const numericVal   = numericMatch ? parseInt(numericMatch[0], 10) : null;
  const prefix       = value.startsWith('±') ? '±' : '';

  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView || reduced || numericVal === null) return;
    let start = 0;
    const duration = 1200;
    const step = 16;
    const increment = numericVal / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= numericVal) { setCount(numericVal); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, step);
    return () => clearInterval(timer);
  }, [inView, reduced, numericVal]);

  const displayValue = numericVal !== null
    ? `${prefix}${inView && !reduced ? count : numericVal}${value.endsWith('%') ? '%' : ''}`
    : value;

  return (
    <motion.div
      ref={ref}
      variants={reduced ? {} : scaleIn(0)}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      style={{
        background: C.deep,
        borderRadius: 16,
        padding: '32px 28px',
        border: '1.5px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(18,57,90,0.2)',
        position: 'relative', overflow: 'hidden',
        cursor: 'default',
      }}
      whileHover={reduced ? {} : { y: -4, boxShadow: '0 12px 36px rgba(18,57,90,0.3)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 28, right: 28, height: 2,
        background: `linear-gradient(90deg, transparent, ${C.warm}70, transparent)`,
      }} />

      <div style={{
        fontFamily: F.mono, fontSize: 'clamp(40px, 5vw, 54px)',
        fontWeight: 600, color: '#fff', lineHeight: 1,
        letterSpacing: '-0.03em', marginBottom: 4,
      }}>
        {displayValue}
        <span style={{ fontSize: '0.38em', color: C.warm, fontWeight: 400, letterSpacing: '0.05em', marginLeft: 5 }}>
          {unit}
        </span>
      </div>

      <div style={{
        fontFamily: F.display, fontSize: 14, fontWeight: 700,
        color: 'rgba(255,255,255,0.9)', marginBottom: 8, marginTop: 14,
      }}>
        {label}
      </div>
      <p style={{ fontFamily: F.body, fontSize: 13, color: 'rgba(255,255,255,0.48)', lineHeight: 1.55 }}>
        {sub}
      </p>
    </motion.div>
  );
}

// ─── Floating blobs (hero depth) ──────────────────────────────────────────────
function HeroBlobs() {
  const reduced = useReducedMotion();
  const blobs = [
    { w: 500, h: 500, top: '-120px', left: '-80px',  color: 'rgba(27,111,168,0.07)',  dur: 8 },
    { w: 320, h: 320, top: '35%',   right: '-50px',  color: 'rgba(100,175,230,0.09)', dur: 10 },
    { w: 240, h: 240, top: '15%',   left: '35%',    color: 'rgba(232,169,76,0.06)',  dur: 9 },
    { w: 180, h: 180, top: '60%',   left: '10%',    color: 'rgba(27,111,168,0.05)',  dur: 11 },
  ];
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: b.w, height: b.h,
            borderRadius: '50%',
            background: b.color,
            filter: 'blur(60px)',
            top: b.top, left: b.left, right: b.right,
          }}
          animate={reduced ? {} : { y: [0, -22, 0], scale: [1, 1.05, 1] }}
          transition={reduced ? {} : { duration: b.dur, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
        />
      ))}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: scrolled ? 'rgba(246,250,253,0.93)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent',
        transition: 'background 0.3s, border-color 0.3s, backdrop-filter 0.3s',
        padding: '0 clamp(20px, 5vw, 80px)',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: C.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 13 L8 3 L13 13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 9.5 H11" stroke={C.warm} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ fontFamily: F.display, fontSize: 17, fontWeight: 700, color: C.deep, letterSpacing: '-0.02em' }}>
          CashCrunch
        </span>
      </div>

      <nav aria-label="Page sections" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 28px)' }}>
        {[
          { label: 'Problem',      href: '#problem'        },
          { label: 'How it works', href: '#architecture'   },
          { label: 'Differentiators', href: '#differentiators' },
          { label: 'Numbers',      href: '#numbers'        },
        ].map(({ label, href }) => (
          <a key={href} href={href} className="nav-link" style={{
            fontFamily: F.body, fontSize: 14, fontWeight: 500,
            color: C.bodyMuted, textDecoration: 'none', display: 'none',
            transition: 'color 0.15s',
          }}>
            {label}
          </a>
        ))}
        <Link to="/app" style={{
          fontFamily: F.body, fontSize: 14, fontWeight: 600,
          color: '#fff', background: C.primary,
          padding: '8px 20px', borderRadius: 8,
          textDecoration: 'none', letterSpacing: '-0.01em',
          transition: 'background 0.15s, transform 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = C.deep; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Launch app →
        </Link>
      </nav>
    </motion.header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const reduced = useReducedMotion();

  return (
    <section style={{
      position: 'relative',
      background: C.bg,
      padding: 'clamp(56px, 9vw, 110px) clamp(20px, 5vw, 80px) clamp(72px, 11vw, 130px)',
      textAlign: 'center',
      overflow: 'hidden',
    }}>
      <HeroBlobs />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto' }}>

        {/* ── Big CashCrunch wordmark ── */}
        <motion.div
          initial={reduced ? {} : { opacity: 0, scale: 0.88, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ marginBottom: 32 }}
        >
          <div style={{
            fontFamily: F.display,
            fontSize: 'clamp(64px, 12vw, 130px)',
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: '-0.045em',
            background: `linear-gradient(135deg, ${C.deep} 0%, ${C.primary} 50%, #3B9FDE 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            userSelect: 'none',
            // Glow effect via text-shadow on a wrapper pseudo-layer
            filter: 'drop-shadow(0 2px 24px rgba(27,111,168,0.22))',
          }}>
            Cash
            <span style={{
              background: `linear-gradient(135deg, ${C.primary} 0%, ${C.warm} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Crunch
            </span>
          </div>

          {/* Tagline under wordmark */}
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            style={{
              fontFamily: F.mono, fontSize: 'clamp(11px, 1.4vw, 14px)',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: C.primary, opacity: 0.75, marginTop: 10,
            }}
          >
            Cash Flow Autopilot · Razorpay AI Buildathon
          </motion.div>
        </motion.div>

        {/* Eyebrow badge */}
        <motion.div
          initial={reduced ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: F.mono, fontSize: 11, fontWeight: 500,
            color: C.primary, letterSpacing: '0.1em', textTransform: 'uppercase',
            background: `${C.primary}12`, border: `1px solid ${C.primary}28`,
            padding: '5px 14px', borderRadius: 20, marginBottom: 28,
          }}
        >
          <motion.span
            style={{ color: '#16A34A', fontSize: 10 }}
            animate={reduced ? {} : { opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ●
          </motion.span>
          Predict shortfalls · Propose fixes · Never acts alone
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={reduced ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.38 }}
          style={{
            fontFamily: F.display,
            fontSize: 'clamp(28px, 4.5vw, 52px)',
            fontWeight: 750, color: C.deep, lineHeight: 1.12,
            letterSpacing: '-0.025em', marginBottom: 20,
          }}
        >
          Know your cash crisis{' '}
          <span style={{
            color: C.primary,
            borderBottom: `3px solid ${C.warm}`,
            paddingBottom: 2,
          }}>
            before payroll fails
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={reduced ? {} : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          style={{
            fontFamily: F.body, fontSize: 'clamp(15px, 2vw, 19px)',
            color: C.bodyMuted, lineHeight: 1.7,
            maxWidth: 580, margin: '0 auto 40px',
          }}
        >
          CashCrunch watches your sales, bank balance, loan EMIs, and payroll together —
          predicts shortfalls up to 14 days ahead, and proposes a bounded, cost-labelled fix
          you approve before money ever moves.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={reduced ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.62 }}
          style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <Link to="/app" style={{
            fontFamily: F.display, fontSize: 16, fontWeight: 700,
            color: '#fff', background: C.primary,
            padding: '14px 34px', borderRadius: 10,
            textDecoration: 'none', letterSpacing: '-0.01em',
            boxShadow: `0 4px 22px ${C.primary}45`,
            transition: 'all 0.18s',
            display: 'inline-block',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.deep; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${C.deep}40`; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 22px ${C.primary}45`; }}
          >
            Open the dashboard
          </Link>
          <a href="#architecture" style={{
            fontFamily: F.display, fontSize: 16, fontWeight: 600,
            color: C.primary, padding: '14px 28px', borderRadius: 10,
            textDecoration: 'none', letterSpacing: '-0.01em',
            border: `1.5px solid ${C.primary}45`,
            transition: 'all 0.18s', background: 'transparent',
            display: 'inline-block',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${C.primary}0c`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            See how it works
          </a>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={reduced ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.5 }}
          style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}
        >
          <motion.div
            animate={reduced ? {} : { y: [0, 7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              color: C.bodyMuted, opacity: 0.5,
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>scroll</span>
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M8 3 L8 14 M4 10 L8 14 L12 10" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Problem Section ──────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    name: 'Payment Gateway',
    tag: 'Incoming sales',
    icon: '↗',
    color: '#1B6FA8',
    desc: "Your sales flow in — but without the full picture, you can't tell if next Friday's payroll is safe.",
    live: true,
    liveLabel: 'Live test-mode API',
  },
  {
    name: 'RazorpayX',
    tag: 'Current account',
    icon: '⚖',
    color: '#0E8A5F',
    desc: "Your operating balance lives here — but it's invisible to Capital and Payroll.",
    live: true,
    liveLabel: 'Live test-mode API',
  },
  {
    name: 'Razorpay Capital',
    tag: 'Business loans',
    icon: '📋',
    color: '#7B4FBF',
    desc: 'EMI due dates create hard cash obligations — but no product today connects them to your payroll date.',
    live: false,
    liveLabel: 'Synthetic — no public sandbox',
  },
  {
    name: 'Razorpay Payroll',
    tag: 'Salary runs',
    icon: '👥',
    color: '#C45A1A',
    desc: "The final, non-negotiable obligation. Today a merchant finds out it's going to fail only when it fails.",
    live: false,
    liveLabel: 'Synthetic — no public sandbox',
  },
];

function ProductCard({ p, index }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? {} : fadeUp(index * 0.1)}
      whileHover={reduced ? {} : { y: -6, boxShadow: '0 12px 32px rgba(27,111,168,0.14)' }}
      transition={{ type: 'spring', stiffness: 280, damping: 18 }}
      style={{
        background: C.cardBg, borderRadius: 16,
        padding: '28px 24px',
        border: `1.5px solid ${C.border}`,
        boxShadow: C.cardShadow,
        display: 'flex', flexDirection: 'column', gap: 12,
        cursor: 'default',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${p.color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {p.icon}
      </div>
      <div>
        <div style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, color: C.deep, marginBottom: 3 }}>
          {p.name}
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: p.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {p.tag}
        </div>
      </div>
      <p style={{ fontFamily: F.body, fontSize: 14, color: C.bodyMuted, lineHeight: 1.62, flex: 1 }}>
        {p.desc}
      </p>
      <div style={{
        fontFamily: F.mono, fontSize: 10,
        color: p.live ? '#0E8A5F' : '#8A6B0E',
        background: p.live ? '#0E8A5F16' : '#8A6B0E16',
        border: `1px solid ${p.live ? '#0E8A5F2e' : '#8A6B0E2e'}`,
        padding: '3px 10px', borderRadius: 6,
        letterSpacing: '0.05em', alignSelf: 'flex-start',
      }}>
        {p.liveLabel}
      </div>
    </motion.div>
  );
}

function ProblemSection() {
  return (
    <section id="problem" style={{ background: C.bgAlt, padding: 'clamp(64px, 8vw, 100px) clamp(20px, 5vw, 80px)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal variants={fadeUp(0)}>
          <p style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary, marginBottom: 12 }}>
            The problem
          </p>
          <h2 style={{ fontFamily: F.display, fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 750, color: C.deep, letterSpacing: '-0.025em', marginBottom: 16, maxWidth: 680, lineHeight: 1.15 }}>
            Four Razorpay products. Same merchant. Zero coordination.
          </h2>
          <p style={{ fontFamily: F.body, fontSize: 16, color: C.bodyMuted, lineHeight: 1.65, maxWidth: 600, marginBottom: 52 }}>
            Razorpay runs payment processing, banking, lending, and payroll — all for the same
            small business. None of these products talk to each other today. A merchant discovers
            a cash shortfall only when a salary run actually fails.
          </p>
        </Reveal>

        <StaggerGrid
          stagger={0.12}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 20,
          }}
        >
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.name} p={p} index={i} />
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}

// ─── Architecture ─────────────────────────────────────────────────────────────
function ArchitectureSection() {
  return (
    <section id="architecture" style={{ background: C.bg, padding: 'clamp(64px, 8vw, 100px) clamp(20px, 5vw, 80px)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal variants={fadeUp(0)}>
          <p style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary, marginBottom: 12 }}>
            How it works
          </p>
          <h2 style={{ fontFamily: F.display, fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 750, color: C.deep, letterSpacing: '-0.025em', marginBottom: 16, maxWidth: 640, lineHeight: 1.15 }}>
            A unified agent across all four data streams
          </h2>
          <p style={{ fontFamily: F.body, fontSize: 16, color: C.bodyMuted, lineHeight: 1.65, maxWidth: 600, marginBottom: 52 }}>
            CashCrunch connects a React dashboard to an Express orchestration layer, a Python
            forecasting engine, and the Razorpay API — combining real payment data with loan
            and payroll schedules into a single 14-day cash runway view.
          </p>
        </Reveal>

        {/* Architecture diagram — instrument-panel frame */}
        <Reveal variants={scaleIn(0.05)}>
          <div style={{
            borderRadius: 18,
            border: `2px solid ${C.border}`,
            background: C.deep,
            padding: 'clamp(10px, 2vw, 18px)',
            boxShadow: `0 12px 48px rgba(18,57,90,0.22), 0 2px 8px rgba(18,57,90,0.12)`,
            maxWidth: 900, margin: '0 auto 52px',
            position: 'relative',
          }}>
            {/* Bezel */}
            <div style={{
              display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 6, marginBottom: 8,
            }}>
              {['#FF5F57','#FEBC2E','#28C840'].map((col, i) => (
                <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: col, opacity: 0.75 }} />
              ))}
              <span style={{ fontFamily: F.mono, fontSize: 10, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.08em', marginLeft: 8 }}>
                system-architecture.png
              </span>
            </div>
            <img
              src="/Architecture.png"
              alt="CashCrunch system architecture — React dashboard, Express API, Python AI service, and Razorpay integrations"
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10 }}
              loading="lazy"
            />
          </div>
        </Reveal>

        {/* 3-step explanation */}
        <StaggerGrid
          stagger={0.14}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 28, maxWidth: 900, margin: '0 auto' }}
        >
          {[
            { step: '01', title: 'Ingest', body: 'Pulls payment gateway transactions, bank balance, synthetic loan EMI schedules, and payroll run dates into a unified merchant model.' },
            { step: '02', title: 'Forecast', body: 'A pandas-based engine projects daily balance for 14 days, using weekday-smoothed inflow estimates and exact obligation dates.' },
            { step: '03', title: 'Propose, never act', body: 'The AI writes a pending recommendation with 2–3 costed options. Only after you approve does the Express server move anything.' },
          ].map((item) => (
            <motion.div
              key={item.step}
              variants={fadeUp(0)}
              style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}
            >
              <div style={{
                fontFamily: F.mono, fontSize: 30, fontWeight: 600,
                color: `${C.primary}28`, flexShrink: 0, lineHeight: 1, marginTop: 3,
              }}>
                {item.step}
              </div>
              <div>
                <div style={{ fontFamily: F.display, fontSize: 17, fontWeight: 700, color: C.deep, marginBottom: 7 }}>
                  {item.title}
                </div>
                <p style={{ fontFamily: F.body, fontSize: 14, color: C.bodyMuted, lineHeight: 1.62 }}>
                  {item.body}
                </p>
              </div>
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}

// ─── Differentiators ──────────────────────────────────────────────────────────
const DIFFS = [
  {
    icon: <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3 10 L7.5 14.5 L17 5" stroke={C.primary} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: 'Propose, not alert',
    body: 'Every shortfall prediction comes with 2–3 bounded options and exact costs — not a vague warning. You see the tradeoff, then approve.',
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke={C.primary} strokeWidth="2"/><path d="M10 6 L10 10 L13 12" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: '14-day runway view',
    body: 'A gauge you can actually fly by — not a balance snapshot. See exactly when the needle enters the red and how much time you have.',
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke={C.primary} strokeWidth="2"/><path d="M7 10 H13 M10 7 V13" stroke={C.primary} strokeWidth="2" strokeLinecap="round"/></svg>,
    title: 'Real integrations, honest labels',
    body: 'Payment Gateway and RazorpayX run against real test-mode APIs. Capital and Payroll are synthetic but clearly labelled — so the code is swap-ready.',
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M4 16 L4 8 L10 4 L16 8 L16 16" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="7.5" y="11" width="5" height="5" rx="1" stroke={C.primary} strokeWidth="1.8"/></svg>,
    title: 'Full audit trail',
    body: 'Every approve → execute → re-forecast cycle writes to an immutable audit log. The merchant sees what ran, when, and with what result.',
  },
];

function DifferentiatorsSection() {
  const reduced = useReducedMotion();
  return (
    <section id="differentiators" style={{ background: C.bgAlt, padding: 'clamp(64px, 8vw, 100px) clamp(20px, 5vw, 80px)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal variants={fadeUp(0)}>
          <p style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary, marginBottom: 12 }}>
            Why it's different
          </p>
          <h2 style={{ fontFamily: F.display, fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 750, color: C.deep, letterSpacing: '-0.025em', marginBottom: 52, maxWidth: 540, lineHeight: 1.15 }}>
            Built for the approve loop, not the alert loop
          </h2>
        </Reveal>

        <StaggerGrid
          stagger={0.11}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}
        >
          {DIFFS.map((d) => (
            <motion.div
              key={d.title}
              variants={reduced ? {} : fadeUp(0)}
              whileHover={reduced ? {} : { y: -6, boxShadow: '0 14px 36px rgba(27,111,168,0.13)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              style={{
                background: C.cardBg, borderRadius: 16,
                padding: '28px 24px',
                border: `1.5px solid ${C.border}`,
                boxShadow: C.cardShadow,
                display: 'flex', flexDirection: 'column', gap: 14,
                cursor: 'default',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${C.primary}0e`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {d.icon}
              </div>
              <div style={{ fontFamily: F.display, fontSize: 16, fontWeight: 700, color: C.deep }}>
                {d.title}
              </div>
              <p style={{ fontFamily: F.body, fontSize: 14, color: C.bodyMuted, lineHeight: 1.62 }}>
                {d.body}
              </p>
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}

// ─── Numbers ──────────────────────────────────────────────────────────────────
const STATS = [
  { value: '50',  unit: 'merchants', label: 'Evaluation corpus',   sub: '15 planted shortfalls, 35 healthy baselines — tested on every run' },
  { value: '±2',  unit: 'days',      label: 'Date tolerance',       sub: 'True positive only if predicted date is within 2 days of ground truth' },
  { value: '±20', unit: '%',         label: 'Amount tolerance',     sub: 'Predicted shortfall depth must be within 20% of planted amount' },
  { value: '14',  unit: 'days',      label: 'Forecast horizon',     sub: 'Daily projected balance — EMI and payroll dates mapped exactly' },
];

function NumbersSection() {
  return (
    <section id="numbers" style={{ background: C.bg, padding: 'clamp(64px, 8vw, 100px) clamp(20px, 5vw, 80px)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal variants={fadeUp(0)}>
          <p style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary, marginBottom: 12 }}>
            The numbers
          </p>
          <h2 style={{ fontFamily: F.display, fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 750, color: C.deep, letterSpacing: '-0.025em', marginBottom: 16, maxWidth: 520, lineHeight: 1.15 }}>
            Instrument readout, not a marketing claim
          </h2>
          <p style={{ fontFamily: F.body, fontSize: 15, color: C.bodyMuted, lineHeight: 1.65, maxWidth: 540, marginBottom: 52 }}>
            {/* [WRITTEN] */}
            Live precision and recall numbers are generated on each accuracy run and
            visible in the Diagnostics tab. The figures below are the evaluation
            methodology — not rounded estimates.
          </p>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
        }}>
          {STATS.map((s) => (
            <AnimatedStat key={s.label} {...s} />
          ))}
        </div>

        {/* Live callout */}
        <Reveal variants={fadeUp(0.15)}>
          <div style={{
            marginTop: 32, padding: '20px 28px',
            background: `${C.primary}0c`,
            border: `1.5px solid ${C.primary}22`,
            borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <motion.div
                style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A' }}
                animate={{ boxShadow: ['0 0 0 0px #16A34A50', '0 0 0 6px #16A34A00'] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
              <span style={{ fontFamily: F.mono, fontSize: 11, color: C.primary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Live precision &amp; recall
              </span>
            </div>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.bodyMuted, flex: 1, minWidth: 200 }}>
              Run the accuracy report from the Diagnostics tab to see current precision, recall,
              and per-merchant exception reasons against the 50-merchant corpus.
            </p>
            <Link to="/app" style={{
              fontFamily: F.mono, fontSize: 12, fontWeight: 600,
              color: C.primary, textDecoration: 'none',
              background: `${C.primary}10`,
              padding: '7px 16px', borderRadius: 7,
              border: `1px solid ${C.primary}2e`,
              whiteSpace: 'nowrap',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${C.primary}20`}
            onMouseLeave={e => e.currentTarget.style.background = `${C.primary}10`}
            >
              Open Diagnostics →
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: C.deep, padding: 'clamp(48px, 6vw, 72px) clamp(20px, 5vw, 80px)' }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', flexWrap: 'wrap', gap: 24,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: C.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 13 L8 3 L13 13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 9.5 H11" stroke={C.warm} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: F.display, fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              CashCrunch
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.04em', marginTop: 2 }}>
              Built with the Razorpay API
            </div>
          </div>
        </div>

        <Link to="/app" style={{
          fontFamily: F.display, fontSize: 15, fontWeight: 700,
          color: '#fff', background: C.primary,
          padding: '12px 28px', borderRadius: 9,
          textDecoration: 'none', letterSpacing: '-0.01em',
          boxShadow: `0 2px 14px ${C.primary}50`,
          transition: 'all 0.18s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1B6FA8cc'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Launch app →
        </Link>
      </div>

      <div style={{
        maxWidth: 1100, margin: '28px auto 0',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 24,
        display: 'flex', gap: 16, flexWrap: 'wrap',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <p style={{ fontFamily: F.body, fontSize: 13, color: 'rgba(255,255,255,0.28)', lineHeight: 1.55 }}>
          Razorpay Capital and Razorpay Payroll integrations are synthetic models — no public sandbox exists.
          Payment Gateway and RazorpayX run against Razorpay test-mode APIs.
        </p>
        <p style={{ fontFamily: F.mono, fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.04em' }}>
          Razorpay AI Buildathon · 2026
        </p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ background: C.bg, color: C.body, overflowX: 'hidden' }}>
      <style>{`
        @media (min-width: 768px) { .nav-link { display: inline !important; } }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>

      <Nav />
      <Hero />
      <ProblemSection />
      <ArchitectureSection />
      <DifferentiatorsSection />
      <NumbersSection />
      <Footer />
    </div>
  );
}
