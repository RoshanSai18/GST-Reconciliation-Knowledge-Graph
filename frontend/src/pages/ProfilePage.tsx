import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react'
import { Mail, Phone, Calendar, Shield, Globe, Key, Clock } from 'lucide-react'

export default function ProfilePage() {
  const { user, isLoaded } = useUser()
  const { sessionId } = useClerkAuth()

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted text-sm animate-pulse">Loading profile…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted text-sm">No user found.</p>
      </div>
    )
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed'
  const email = user.primaryEmailAddress?.emailAddress ?? '—'
  const phone = user.primaryPhoneNumber?.phoneNumber ?? '—'
  const username = user.username ?? '—'
  const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  }) : '—'
  const updatedAt = user.updatedAt ? new Date(user.updatedAt).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  }) : '—'

  const initials = fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header card */}
      <div className="bg-surface rounded-2xl p-6 shadow-card-lg">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          {user.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={fullName}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-accent/20 shadow-glow"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-accent-lt border-2 border-accent/20 flex items-center justify-center shadow-glow">
              <span className="text-2xl font-bold text-accent">{initials}</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate">{fullName}</h2>
            {user.username && (
              <p className="text-[13px] text-muted mt-0.5">@{user.username}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg">
                <Shield size={11} />
                Admin
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-accent-lt text-accent px-2.5 py-1 rounded-lg">
                <Key size={11} />
                Active Session
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard icon={Mail}     label="Email"       value={email} />
        <InfoCard icon={Phone}    label="Phone"       value={phone} />
        <InfoCard icon={Globe}    label="Username"    value={username} />
        <InfoCard icon={Calendar} label="Joined"      value={createdAt} />
        <InfoCard icon={Clock}    label="Last Updated" value={updatedAt} />
        <InfoCard icon={Key}      label="Session ID"  value={sessionId ?? '—'} mono />
      </div>

      {/* Connected accounts */}
      {user.externalAccounts && user.externalAccounts.length > 0 && (
        <div className="bg-surface rounded-2xl p-6 shadow-card-lg">
          <h3 className="text-[14px] font-bold text-foreground mb-4">Connected Accounts</h3>
          <div className="space-y-3">
            {user.externalAccounts.map((acct) => (
              <div
                key={acct.id}
                className="flex items-center gap-3 bg-bg rounded-xl px-4 py-3"
                style={{ border: '1px solid #E4E4E7' }}
              >
                {acct.imageUrl && (
                  <img src={acct.imageUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {acct.firstName} {acct.lastName}
                  </p>
                  <p className="text-[11px] text-muted truncate">
                    {acct.provider} · {acct.emailAddress}
                  </p>
                </div>
                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">
                  Linked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User ID */}
      <div className="text-center">
        <p className="text-[11px] text-subtle">
          Clerk User ID: <span className="font-mono text-muted">{user.id}</span>
        </p>
      </div>
    </div>
  )
}

/* ── Small reusable info card ──────────────────────────────────────────── */

function InfoCard({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
      className="bg-surface rounded-xl px-4 py-3.5 flex items-start gap-3 shadow-card"
      style={{ border: '1px solid #F4F4F5' }}
    >
      <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-subtle uppercase tracking-wider">{label}</p>
        <p
          className={`text-[13px] text-foreground mt-0.5 truncate ${mono ? 'font-mono text-[12px]' : ''}`}
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  )
}
