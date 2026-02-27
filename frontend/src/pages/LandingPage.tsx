import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type MouseEvent as RMouseEvent,
} from 'react'
import { useClerk } from '@clerk/clerk-react'
import {
  GitMerge,
  Shield,
  Network,
  ShieldCheck,
  FileSearch,
  TrendingUp,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'

// ── Scroll-reveal hook ─────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.unobserve(el)
        }
      },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return { ref, visible }
}

// ── Hero background graph (pure SVG, CSS-animated) ────────────────────────────
const HERO_NODES = [
  { cx: 120, cy: 180, r: 7,  delay: '0s',    color: '#6366F1' },
  { cx: 300, cy: 100, r: 5,  delay: '0.6s',  color: '#4F46E5' },
  { cx: 480, cy: 200, r: 9,  delay: '1.2s',  color: '#818CF8' },
  { cx: 640, cy: 90,  r: 6,  delay: '0.3s',  color: '#6366F1' },
  { cx: 780, cy: 220, r: 5,  delay: '1.8s',  color: '#4F46E5' },
  { cx: 950, cy: 130, r: 8,  delay: '0.9s',  color: '#818CF8' },
  { cx: 1100,cy: 240, r: 6,  delay: '0.4s',  color: '#6366F1' },
  { cx: 200, cy: 320, r: 5,  delay: '1.5s',  color: '#4338CA' },
  { cx: 400, cy: 350, r: 7,  delay: '0.7s',  color: '#6366F1' },
  { cx: 580, cy: 300, r: 5,  delay: '2.1s',  color: '#818CF8' },
  { cx: 760, cy: 370, r: 8,  delay: '1.1s',  color: '#4F46E5' },
  { cx: 1000,cy: 310, r: 5,  delay: '0.2s',  color: '#6366F1' },
  { cx: 1200,cy: 170, r: 7,  delay: '1.7s',  color: '#818CF8' },
  { cx: 70,  cy: 370, r: 4,  delay: '2.4s',  color: '#4338CA' },
]

const HERO_EDGES = [
  [0,  1], [1,  2], [2,  3], [3,  4], [4,  5],
  [5,  6], [6, 12], [0,  7], [7,  8], [8,  9],
  [9, 10], [10,11], [2,  8], [4, 10], [1,  7],
  [3,  9], [5, 11], [13, 7], [12, 5], [11, 6],
]

function HeroGraph() {
  return (
    <svg
      viewBox="0 0 1280 460"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="heroMask" cx="50%" cy="50%" r="50%">
          <stop offset="40%" stopColor="transparent" stopOpacity="0" />
          <stop offset="100%" stopColor="#05050A" stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Edges */}
      {HERO_EDGES.map(([a, b], i) => {
        const na = HERO_NODES[a], nb = HERO_NODES[b]
        return (
          <line
            key={i}
            x1={na.cx} y1={na.cy}
            x2={nb.cx} y2={nb.cy}
            stroke="#6366F1"
            strokeWidth="1"
            style={{
              animation: `edgeFade 5s cubic-bezier(0.4,0,0.6,1) infinite`,
              animationDelay: `${(i * 0.18).toFixed(2)}s`,
            }}
          />
        )
      })}

      {/* Outer glow rings */}
      {HERO_NODES.map((n, i) => (
        <circle
          key={`ring-${i}`}
          cx={n.cx} cy={n.cy}
          r={n.r + 6}
          fill="none"
          stroke={n.color}
          strokeWidth="1"
          style={{
            animation: `nodePulse 4s cubic-bezier(0.4,0,0.6,1) infinite`,
            animationDelay: n.delay,
            opacity: 0,
          }}
        />
      ))}

      {/* Nodes */}
      {HERO_NODES.map((n, i) => (
        <circle
          key={`node-${i}`}
          cx={n.cx} cy={n.cy} r={n.r}
          fill={n.color}
          style={{
            animation: `nodePulse 4s cubic-bezier(0.4,0,0.6,1) infinite`,
            animationDelay: n.delay,
          }}
        />
      ))}

      {/* Fade-out vignette */}
      <rect x="0" y="0" width="1280" height="460" fill="url(#heroMask)" />
    </svg>
  )
}

// ── Bento Card with cursor-following glow ────────────────────────────────────
interface BentoCardProps {
  icon: React.ReactNode
  title: string
  body: string
  className?: string
  delay?: string
  accent?: string
}

function BentoCard({ icon, title, body, className = '', delay = '0s', accent = '#4F46E5' }: BentoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [glow, setGlow] = useState({ x: 0, y: 0, opacity: 0 })
  const { ref: revealRef, visible } = useReveal()

  const setRef = useCallback((el: HTMLDivElement | null) => {
    ;(cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    ;(revealRef as React.MutableRefObject<HTMLElement | null>).current = el
  }, [revealRef])

  function handleMouseMove(e: RMouseEvent<HTMLDivElement>) {
    const rect = cardRef.current!.getBoundingClientRect()
    setGlow({ x: e.clientX - rect.left, y: e.clientY - rect.top, opacity: 1 })
  }

  function handleMouseLeave() {
    setGlow(g => ({ ...g, opacity: 0 }))
  }

  return (
    <div
      ref={setRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-2xl border border-zinc-100 bg-white p-7 shadow-card transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      } ${className}`}
      style={{ transitionDelay: delay }}
    >
      {/* Cursor glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: glow.opacity,
          background: `radial-gradient(280px circle at ${glow.x}px ${glow.y}px, ${accent}14, transparent 70%)`,
        }}
      />

      <div
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: `${accent}12` }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <h3 className="mb-2 text-[17px] font-bold tracking-tight text-zinc-900">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-zinc-500">{body}</p>
    </div>
  )
}

// ── Trust logos (text-based wordmarks) ────────────────────────────────────────
const TRUST_LOGOS = [
  'Deloitte', 'Ernst & Young', 'KPMG', 'PricewaterhouseCoopers', 'Grant Thornton', 'BDO India',
]

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const { openSignIn } = useClerk()
  const [scrolled, setScrolled]     = useState(false)

  const trustReveal  = useReveal()
  const footerReveal = useReveal()

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#05050A', color: '#FAFAFA' }}>

      {/* ── 1. STICKY NAV ─────────────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ease-out ${
          scrolled
            ? 'border-b border-white/8 bg-[#05050A]/70 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 select-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent shadow-glow">
              <GitMerge size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-white">
              Graph<span className="text-indigo-400">GST</span>
            </span>
          </div>

          {/* Center links */}
          <nav className="hidden items-center gap-8 md:flex">
            {['Platform', 'Solutions', 'Security', 'Docs'].map(link => (
              <button
                key={link}
                onClick={() => scrollTo(link.toLowerCase())}
                className="text-[13px] font-medium text-zinc-400 transition-colors duration-200 hover:text-white"
              >
                {link}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => openSignIn({ afterSignInUrl: '/profile' })}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-zinc-300 ring-1 ring-white/15 transition-all duration-200 hover:bg-white/8 hover:text-white hover:ring-white/25"
            >
              Sign In
            </button>
            <button
              onClick={() => openSignIn({ afterSignInUrl: '/profile' })}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900 transition-all duration-200 hover:bg-zinc-100 hover:shadow-lg"
            >
              Request Demo
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. HERO ───────────────────────────────────────────────────────── */}
      <section
        id="platform"
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-20 text-center"
      >
        {/* Animated network background */}
        <div className="absolute inset-0 overflow-hidden">
          <HeroGraph />
        </div>

        {/* Radial glow behind headline */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 40%, rgba(79,70,229,0.18) 0%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-4xl animate-fade-in-up">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
              Graph Intelligence Platform
            </span>
          </div>

          <h1
            className="mb-6 text-5xl font-extrabold leading-[1.05] tracking-[-0.03em] md:text-6xl lg:text-7xl"
            style={{
              background: 'linear-gradient(135deg, #FFFFFF 30%, #A5B4FC 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Tax Reconciliation,<br />
            Solved by Graph Intelligence.
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-[17px] leading-relaxed text-zinc-400">
            Stop chasing spreadsheets. GraphGST uses multi-hop knowledge graphs to instantly detect
            ITC leakage, uncover vendor fraud, and automate compliance.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => openSignIn({ afterSignInUrl: '/profile' })}
              className="group flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-[14px] font-semibold text-white shadow-glow transition-all duration-200 hover:bg-accent-h hover:shadow-none"
            >
              Deploy Engine
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => scrollTo('features')}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-[14px] font-semibold text-zinc-300 transition-all duration-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              Read the Whitepaper
              <ChevronRight size={15} className="text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-40">
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Scroll</span>
          <div className="h-8 w-px bg-gradient-to-b from-zinc-600 to-transparent" />
        </div>
      </section>

      {/* ── 3. TRUST BAR ─────────────────────────────────────────────────── */}
      <section
        id="solutions"
        ref={trustReveal.ref as React.RefObject<HTMLElement>}
        className={`border-y py-14 transition-all duration-700 ease-out ${
          trustReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0D0D15' }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-10 text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
            Trusted by leading auditing firms and Fortune 500 enterprises
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {TRUST_LOGOS.map(name => (
              <span
                key={name}
                className="text-[15px] font-semibold text-zinc-700 transition-colors duration-200 hover:text-zinc-400 cursor-default select-none"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. BENTO GRID ────────────────────────────────────────────────── */}
      <section
        id="features"
        className="px-6 py-24"
        style={{ background: '#F4F4F6' }}
      >
        <div className="mx-auto max-w-6xl">
          {/* Section header */}
          <div className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-indigo-500">
              Platform Capabilities
            </p>
            <h2 className="text-4xl font-extrabold tracking-[-0.025em] text-zinc-900 md:text-5xl">
              Built for enterprise-grade<br />tax intelligence.
            </h2>
          </div>

          {/* Asymmetric grid */}
          <div className="grid auto-rows-[220px] grid-cols-1 gap-4 md:grid-cols-3">

            {/* Card 1 — Large (spans 2 cols, 2 rows) */}
            <BentoCard
              icon={<Network size={22} />}
              title="Multi-Hop Graph Traversal"
              body="GraphGST maps your entire supply chain as a live knowledge graph. Instead of surface-level checks, our engine traverses 3–5 hops deep into vendor networks to surface hidden circular trades, shell company structures, and ITC leakage rings that flat-file reconciliation simply cannot detect."
              className="row-span-2 flex flex-col justify-between md:col-span-2 !py-9"
              delay="0ms"
              accent="#4F46E5"
            />

            {/* Card 2 */}
            <BentoCard
              icon={<ShieldCheck size={20} />}
              title="Zero False Positives"
              body="Our IsolationForest + RandomForest ML pipeline is trained on synthetic GST data calibrated to CBIC patterns. Risk scores are explainable and threshold-tuned to minimize noise for audit teams."
              delay="80ms"
              accent="#059669"
            />

            {/* Card 3 */}
            <BentoCard
              icon={<FileSearch size={20} />}
              title="Automated Audit Trails"
              body="Every reconciliation decision is backed by a structured explanation: hop path, timestamp deltas, value deviation percentages, and the exact rule or model that triggered the flag."
              delay="160ms"
              accent="#D97706"
            />

            {/* Card 4 — Spans full width on mobile, 1 col on desktop */}
            <BentoCard
              icon={<TrendingUp size={20} />}
              title="Real-Time Risk Scoring"
              body="Vendors and invoices receive continuously updated compliance scores as new GSTR filings are ingested. High-risk entities are surfaced immediately — no batch-week lag."
              className="md:col-span-3"
              delay="240ms"
              accent="#7C3AED"
            />

          </div>
        </div>
      </section>

      {/* ── 5. FOOTER ────────────────────────────────────────────────────── */}
      <footer
        id="security"
        ref={footerReveal.ref as React.RefObject<HTMLElement>}
        className={`border-t px-6 py-16 transition-all duration-700 ease-out ${
          footerReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#05050A' }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-12 md:grid-cols-4">

            {/* Col 1 — Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                  <GitMerge size={16} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-[16px] font-bold text-white">
                  Graph<span className="text-indigo-400">GST</span>
                </span>
              </div>
              <p className="max-w-[220px] text-[12.5px] leading-relaxed text-zinc-600">
                AI-powered GST reconciliation using Neo4j knowledge graphs. Built for India's compliance ecosystem.
              </p>
            </div>

            {/* Col 2 — Platform */}
            <div>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Platform</p>
              <ul className="space-y-3">
                {['Graph Explorer', 'Invoice Ledger', 'Vendor Risk', 'Pattern Detection', 'Data Upload'].map(item => (
                  <li key={item}>
                    <span className="cursor-default text-[13px] text-zinc-500 transition-colors hover:text-zinc-300">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3 — Legal */}
            <div>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Legal</p>
              <ul className="space-y-3">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Data Processing Agreement'].map(item => (
                  <li key={item}>
                    <span className="cursor-default text-[13px] text-zinc-500 transition-colors hover:text-zinc-300">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4 — Support */}
            <div>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Support</p>
              <ul className="space-y-3">
                {['Documentation', 'API Reference', 'Contact Sales', 'Security'].map(item => (
                  <li key={item}>
                    <span className="cursor-default text-[13px] text-zinc-500 transition-colors hover:text-zinc-300">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className="mt-14 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <p className="text-[12px] text-zinc-700">
              © 2026 GraphGST. All rights reserved.
            </p>
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-700">
              <Shield size={12} className="text-zinc-600" />
              SOC 2 Type II Certified · ISO 27001 · CERT-In Compliant
            </div>
          </div>
        </div>
      </footer>


    </div>
  )
}
