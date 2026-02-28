import { useClerk, useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Zap,
  Network,
  ShieldAlert,
  MessageSquare,
  Upload,
  BrainCircuit,
  CheckCircle,
  IndianRupee,
  BarChart2,
  Users,
  FileText,
  Clock,
  GitMerge,
  AlertTriangle,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function NavBar({ onSignIn, onGetStarted, isSignedIn }: { onSignIn: () => void; onGetStarted: () => void; isSignedIn: boolean }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Network size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">
            GST<span className="text-indigo-600">Insights</span>
          </span>
        </div>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
          <a href="#features" className="hover:text-gray-900 transition">Features</a>
          <a href="#how-it-works" className="hover:text-gray-900 transition">How It Works</a>
          <a href="#use-cases" className="hover:text-gray-900 transition">Use Cases</a>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {!isSignedIn && (
            <button
              onClick={onSignIn}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition px-3 py-1.5"
            >
              Sign In
            </button>
          )}
          <button
            onClick={onGetStarted}
            className="flex items-center gap-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 transition"
          >
            {isSignedIn ? 'Go to Dashboard' : 'Get Started'} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </nav>
  )
}

/* ---- Mock Dashboard Preview ---------------------------------------- */
const barData = [38, 52, 44, 68, 90, 58, 76, 55, 82, 48, 96, 62]

function DashboardMockup() {
  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
      {/* Window chrome */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-4 h-5 bg-gray-200 rounded-md" />
      </div>

      <div className="p-5 space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'TOTAL INVOICES', value: '5,180', color: 'text-indigo-600' },
            { label: 'HIGH RISK',      value: '930',   color: 'text-red-500' },
            { label: 'ITC AT RISK',    value: '₹3.9Cr', color: 'text-amber-600' },
            { label: 'TRUST SCORE',   value: '78%',   color: 'text-emerald-600' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 h-28 flex items-end gap-2">
          {barData.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${h}%`,
                background: h >= 80 ? '#6366f1' : '#e0e0e0',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---- Stat pill -------------------------------------------------------- */
function StatPill({ icon, value, label, bg, iconColor }: {
  icon: React.ReactNode; value: string; label: string; bg: string; iconColor: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="font-bold text-gray-900 text-lg leading-tight">{value}</p>
        <p className="text-gray-500 text-xs">{label}</p>
      </div>
    </div>
  )
}

/* ---- Mini bar sparkline for pattern cards ----------------------------- */
function MiniBar({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  return (
    <div className="flex items-end gap-1 h-14">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${(v / max) * 100}%`, background: color }}
        />
      ))}
    </div>
  )
}

/* ---- Feature card ---------------------------------------------------- */
function FeatureCard({ badge, badgeColor, icon, iconBg, title, desc, tags, children }: {
  badge: string; badgeColor: string; icon: React.ReactNode; iconBg: string;
  title: string; desc: string; tags?: string[]; children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className={`text-xs font-bold uppercase tracking-wider ${badgeColor}`}>{badge}</span>
      </div>
      <div>
        <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">{desc}</p>
      </div>
      {tags && (
        <div className="flex flex-wrap gap-2 mt-1">
          {tags.map(t => (
            <span key={t} className="text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg px-2.5 py-1">
              {t}
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const { openSignIn } = useClerk()
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()

  const handleSignIn = () => openSignIn()
  const handleGetStarted = () => {
    if (isSignedIn) {
      navigate('/dashboard')
    } else {
      openSignIn({ afterSignInUrl: '/dashboard' })
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <NavBar onSignIn={handleSignIn} onGetStarted={handleGetStarted} isSignedIn={!!isSignedIn} />

      {/* ============================================================ */}
      {/* HERO                                                          */}
      {/* ============================================================ */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-indigo-50/60 to-white px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-1.5 text-xs text-gray-600 shadow-sm">
            <Sparkles size={13} className="text-indigo-500" />
            Powered by Sarvam AI · Knowledge Graph Intelligence
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
            Reconcile GST invoices{' '}
            <span className="text-indigo-600">at scale</span>, intelligently.
          </h1>

          {/* Sub */}
          <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
            Detect ITC mismatches, circular-trade fraud, and filing anomalies across your
            entire vendor network — in real time, with AI-driven explainability.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={handleGetStarted}
              className="flex items-center gap-2 bg-indigo-600 text-white font-semibold rounded-xl px-7 py-3 text-sm hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
            >
              Open Dashboard <ArrowRight size={16} />
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 font-semibold rounded-xl px-7 py-3 text-sm hover:bg-gray-50 transition bg-white"
            >
              See How It Works
            </button>
          </div>
        </div>

        {/* Mockup */}
        <div className="max-w-3xl mx-auto mt-14">
          <DashboardMockup />
        </div>

        {/* Stats row */}
        <div className="max-w-3xl mx-auto mt-14 grid grid-cols-2 md:grid-cols-4 gap-8">
          <StatPill
            icon={<FileText size={18} />}
            value="5,180+"
            label="Invoices Processed"
            bg="bg-indigo-100"
            iconColor="text-indigo-600"
          />
          <StatPill
            icon={<IndianRupee size={18} />}
            value="₹2 Cr+"
            label="ITC Protected"
            bg="bg-emerald-100"
            iconColor="text-emerald-600"
          />
          <StatPill
            icon={<BarChart2 size={18} />}
            value="93%"
            label="Match Accuracy"
            bg="bg-amber-100"
            iconColor="text-amber-600"
          />
          <StatPill
            icon={<Users size={18} />}
            value="100+"
            label="Vendors Mapped"
            bg="bg-violet-100"
            iconColor="text-violet-600"
          />
        </div>
      </section>

      {/* ============================================================ */}
      {/* FEATURES                                                      */}
      {/* ============================================================ */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Platform Features</p>
            <h2 className="text-4xl font-extrabold text-gray-900">Everything you need for GST compliance</h2>
            <p className="text-gray-500 max-w-md mx-auto text-sm">
              From automated reconciliation to AI-powered fraud detection — built for Indian tax professionals.
            </p>
          </div>

          {/* Bento grid: left col (2/3) + right col (1/3) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left: Reconciliation + AI Assistant stacked */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <FeatureCard
                badge="Core Engine"
                badgeColor="text-indigo-600"
                iconBg="bg-indigo-50"
                icon={<BrainCircuit size={20} className="text-indigo-600" />}
                title="AI-Powered Reconciliation"
                desc="Automatically match GSTR-2B purchase data against vendor GSTR-1 filings. Get explainable mismatch reports with root-cause analysis powered by Gemini AI."
                tags={['GSTR-1', 'GSTR-2B', 'GSTR-3B', 'ITC Claims']}
              />
              <FeatureCard
                badge="AI Assistant"
                badgeColor="text-emerald-600"
                iconBg="bg-emerald-50"
                icon={<MessageSquare size={20} className="text-emerald-600" />}
                title="Multi-language Chat"
                desc="Ask questions in English, Hindi, or Telugu. Get instant answers about reconciliation status, risk levels, and compliance guidance."
              />
            </div>
            {/* Right: Graph + Risk stacked */}
            <div className="flex flex-col gap-4">
              <FeatureCard
                badge="Graph Intelligence"
                badgeColor="text-violet-600"
                iconBg="bg-violet-50"
                icon={<Network size={20} className="text-violet-600" />}
                title="Knowledge Graph Explorer"
                desc="Visualize your entire vendor network as an interactive knowledge graph. Trace invoice chains, identify connected entities, and spot anomalies in the graph topology."
              />
              <FeatureCard
                badge="Risk Detection"
                badgeColor="text-red-600"
                iconBg="bg-red-50"
                icon={<ShieldAlert size={20} className="text-red-500" />}
                title="Circular Trade & Fraud"
                desc="Detect circular trading patterns, shell company networks, and suspicious invoice chains using graph-based anomaly detection."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* HOW IT WORKS                                                  */}
      {/* ============================================================ */}
      <section id="how-it-works" className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Simple 3-Step Workflow</p>
            <h2 className="text-4xl font-extrabold text-gray-900">From data to insights in minutes</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector lines (desktop) */}
            <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-px bg-gray-200" />
            <div className="hidden md:block absolute top-12 left-2/3 right-0 h-px bg-gray-200" style={{ right: '33.33%' }} />

            {[
              {
                num: '01',
                icon: <Upload size={28} className="text-indigo-600" />,
                title: 'Upload Your Data',
                desc: 'Import taxpayer records, invoices, and ITC claims via CSV. Supports bulk uploads for all GSTIN formats.',
              },
              {
                num: '02',
                icon: <BrainCircuit size={28} className="text-indigo-600" />,
                title: 'AI Builds the Graph',
                desc: 'The engine parses your data, constructs a Neo4j knowledge graph, and runs ML-based risk scoring automatically.',
              },
              {
                num: '03',
                icon: <CheckCircle size={28} className="text-emerald-600" />,
                title: 'Reconcile & Act',
                desc: 'Review prioritized mismatches, drill into graph paths, and export compliance reports — all in one place.',
              },
            ].map(step => (
              <div key={step.num} className="flex flex-col items-center text-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl border border-gray-200 bg-white shadow-sm flex items-center justify-center">
                    {step.icon}
                  </div>
                  <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">{step.num}</span>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{step.title}</h3>
                  <p className="text-gray-500 text-sm mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* PATTERN DETECTION                                             */}
      {/* ============================================================ */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Advanced Threat Detection</p>
            <h2 className="text-4xl font-extrabold text-gray-900">Pattern Detection with Visual Insights</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-sm">
              Real-time monitoring of GST anomalies across 4 critical fraud vectors. GSTInsights analyzes your
              vendor network to identify hidden risks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                accent: '#6366f1',
                iconBg: 'bg-indigo-100',
                icon: <Network size={18} className="text-indigo-600" />,
                title: 'Circular Trading',
                desc: 'Detect closed-loop transactions with identical parties',
                data: [55, 80, 65, 90, 75, 85],
                stat1: { v: '127', l: 'Detected', c: 'text-indigo-600' },
                stat2: { v: 'Critical', l: 'RiskLevel', c: 'text-indigo-600' },
                stat3: { v: '₹4.2Cr', l: 'Impact', c: 'text-indigo-600' },
              },
              {
                accent: '#f59e0b',
                iconBg: 'bg-amber-100',
                icon: <Clock size={18} className="text-amber-600" />,
                title: 'Payment Delays',
                desc: 'Track overdue vendor payments & suspicious timing patterns',
                data: [70, 65, 80, 60, 90, 75],
                stat1: { v: '342', l: 'Detected', c: 'text-amber-600' },
                stat2: { v: '45+', l: 'AvgDays', c: 'text-amber-600' },
                stat3: { v: 'High', l: 'Impact', c: 'text-amber-600' },
              },
              {
                accent: '#ef4444',
                iconBg: 'bg-red-100',
                icon: <GitMerge size={18} className="text-red-500" />,
                title: 'Amendment Chains',
                desc: 'Flag repeated invoice modifications & credit note abuse',
                data: [40, 65, 55, 75, 60, 85],
                stat1: { v: '89', l: 'Detected', c: 'text-red-500' },
                stat2: { v: '3.2x', l: 'AvgDepth', c: 'text-red-500' },
                stat3: { v: '₹1.8Cr', l: 'Impact', c: 'text-red-500' },
              },
              {
                accent: '#10b981',
                iconBg: 'bg-emerald-100',
                icon: <AlertTriangle size={18} className="text-emerald-600" />,
                title: 'Risk Networks',
                desc: 'Map vendor interconnections & suspicious entity clusters',
                data: [50, 70, 60, 85, 70, 80],
                stat1: { v: '27', l: 'Detected', c: 'text-emerald-600' },
                stat2: { v: '8.3/10', l: 'RiskScore', c: 'text-emerald-600' },
                stat3: { v: '₹2.9Cr', l: 'Impact', c: 'text-emerald-600' },
              },
            ].map(p => (
              <div
                key={p.title}
                className="rounded-2xl border border-gray-100 bg-white overflow-hidden"
                style={{ borderTop: `3px solid ${p.accent}` }}
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${p.iconBg}`}>
                      {p.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{p.title}</h3>
                      <p className="text-gray-400 text-xs">{p.desc}</p>
                    </div>
                  </div>
                  <MiniBar data={p.data} color={p.accent + '55'} />
                  <div className="flex justify-between pt-1">
                    {[p.stat1, p.stat2, p.stat3].map(s => (
                      <div key={s.l} className="text-center">
                        <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
                        <p className="text-gray-400 text-xs">{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* ANOMALY STATS BANNER                                          */}
      {/* ============================================================ */}
      <section className="py-12 px-6 bg-indigo-50/60">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-indigo-100 bg-white/70 backdrop-blur px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: '📊', value: '585', label: 'Total Anomalies' },
              { icon: '⚠️', value: '7.8/10', label: 'Avg Risk Score' },
              { icon: '✓', value: '94.2%', label: 'Detection Accuracy' },
              { icon: '✨', value: '2.1%', label: 'False Positives' },
            ].map(s => (
              <div key={s.label} className="space-y-1">
                <div className="text-2xl">{s.icon}</div>
                <p className="text-2xl font-extrabold text-gray-900">{s.value}</p>
                <p className="text-gray-500 text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* USE CASES                                                     */}
      {/* ============================================================ */}
      <section id="use-cases" className="py-16 px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Use Cases</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: <Zap size={14} />, label: 'ITC Mismatch Detection' },
              { icon: <ShieldAlert size={14} />, label: 'Fraud & Shell Company Alerts' },
              { icon: <TrendingUp size={14} />, label: 'Payment Delay Tracking' },
              { icon: <Network size={14} />, label: 'Vendor Risk Profiling' },
              { icon: <FileText size={14} />, label: 'Audit Trail Generation' },
              { icon: <MessageSquare size={14} />, label: 'Multilingual AI Queries' },
            ].map(u => (
              <button
                key={u.label}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 font-medium hover:border-indigo-300 hover:bg-indigo-50 transition"
              >
                <span className="text-gray-500">{u.icon}</span>
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FOOTER CTA                                                    */}
      {/* ============================================================ */}
      <section className="py-20 px-6 bg-indigo-600">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-extrabold text-white leading-snug">
            Ready to automate your GST compliance?
          </h2>
          <p className="text-indigo-200 text-sm">
            Join hundreds of tax professionals already using GSTInsights to save time and reduce risk.
          </p>
          <button
            onClick={handleGetStarted}
            className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold rounded-xl px-8 py-3 text-sm hover:bg-indigo-50 transition shadow-lg"
          >
            Get Started Free <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-8 px-6 text-center text-gray-500 text-xs">
        © 2026 GSTInsights. Built for Indian GST compliance.
      </footer>
    </div>
  )
}
