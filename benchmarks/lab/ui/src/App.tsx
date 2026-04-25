import { useState } from 'react'
import { Beaker, ScrollText } from 'lucide-react'
import Lab from '@/components/Lab'
import Findings from '@/components/Findings'
import { cn } from '@/lib/utils'

type View = 'lab' | 'findings'

export default function App() {
  const [view, setView] = useState<View>('lab')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-48 shrink-0 border-r border-zinc-900 bg-zinc-950 flex flex-col">
        <div className="px-4 py-4 border-b border-zinc-900">
          <div className="text-sm font-semibold tracking-tight">Dynamic PDF Lab</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">
            Phase-3 R&D
          </div>
        </div>
        <nav className="p-2 space-y-1 flex-1">
          <NavButton
            active={view === 'lab'}
            onClick={() => setView('lab')}
            icon={<Beaker className="size-4" />}
          >
            Lab
          </NavButton>
          <NavButton
            active={view === 'findings'}
            onClick={() => setView('findings')}
            icon={<ScrollText className="size-4" />}
          >
            Findings
          </NavButton>
        </nav>
        <div className="p-3 text-[10px] text-zinc-600 border-t border-zinc-900">
          Approach C · overlay engine · Latin + Arabic
        </div>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">
        {view === 'lab' ? <Lab /> : <Findings />}
      </div>
    </div>
  )
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-amber-500/10 text-amber-200 border border-amber-500/30'
          : 'text-zinc-400 hover:bg-zinc-900 border border-transparent',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
