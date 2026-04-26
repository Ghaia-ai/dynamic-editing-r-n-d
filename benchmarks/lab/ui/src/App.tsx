import { useState } from 'react'
import Lab from '@/components/Lab'
import Findings from '@/components/Findings'
import { cn } from '@/lib/utils'

type View = 'lab' | 'findings'

export default function App() {
  const [view, setView] = useState<View>('lab')

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[color:var(--ink)]">
      <header className="bg-[var(--surface)] border-b border-[color:var(--line)]">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between gap-8">
          <div className="flex items-baseline gap-3">
            <div className="text-[15px] font-semibold tracking-tight">
              Dynamic PDF Editing Lab
            </div>
            <div className="text-[12px] text-[color:var(--ink-muted)]">
              R&D · Phase 3
            </div>
          </div>
          <nav className="flex gap-1">
            <ViewTab active={view === 'lab'} onClick={() => setView('lab')}>
              Lab
            </ViewTab>
            <ViewTab active={view === 'findings'} onClick={() => setView('findings')}>
              Findings
            </ViewTab>
          </nav>
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col">
        {view === 'lab' ? <Lab /> : <Findings />}
      </main>
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[13px] px-3 py-1.5 rounded-md transition-colors',
        active
          ? 'bg-[var(--accent-soft)] text-[color:var(--accent-ink)]'
          : 'text-[color:var(--ink-soft)] hover:bg-[var(--line-soft)]',
      )}
    >
      {children}
    </button>
  )
}
