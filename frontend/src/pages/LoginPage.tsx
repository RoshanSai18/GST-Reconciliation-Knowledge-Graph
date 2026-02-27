import { SignIn } from '@clerk/clerk-react'
import { GitMerge } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      {/* Subtle radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(79,70,229,0.06),transparent_60%)]" />

      <div className="relative flex flex-col items-center gap-6 w-full max-w-[400px] animate-fade-in-up">
        {/* Brand header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-glow">
            <GitMerge size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Graph<span className="text-accent">GST</span>
            </h1>
            <p className="text-[11px] text-muted">AI Reconciliation Engine</p>
          </div>
        </div>

        {/* Clerk pre-built Sign In widget */}
        <SignIn
          routing="path"
          path="/login"
          afterSignInUrl="/profile"
          appearance={{
            variables: {
              colorPrimary: '#4F46E5',
              colorBackground: '#FAFAFA',
              colorInputBackground: '#FFFFFF',
              colorText: '#18181B',
              colorTextSecondary: '#71717A',
              borderRadius: '0.75rem',
              fontFamily: 'inherit',
            },
            elements: {
              card: 'shadow-card-lg border-0',
              formButtonPrimary:
                'bg-accent hover:bg-accent-h text-white font-bold rounded-xl shadow-glow hover:shadow-none transition-all',
            },
          }}
        />
      </div>
    </div>
  )
}
