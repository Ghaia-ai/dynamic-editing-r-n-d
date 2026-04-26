import { motion } from 'framer-motion'
import type { MethodDef, MethodId } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  methods: MethodDef[]
  current: MethodId
  onSelect: (id: MethodId) => void
}

export default function MethodTabs({ methods, current, onSelect }: Props) {
  if (methods.length === 0) return null
  return (
    <div className="flex items-center gap-1 border-b border-[color:var(--line)] -mb-px">
      {methods.map((m) => {
        const active = m.id === current
        const live = m.implementation === 'live'
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(
              'relative px-4 py-2.5 text-[13px] flex items-center gap-2 transition-colors',
              active
                ? 'text-[color:var(--ink)]'
                : 'text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]',
            )}
          >
            <span
              className={cn(
                'inline-flex items-center justify-center size-5 rounded-full text-[11px] font-mono font-medium',
                active
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--line-soft)] text-[color:var(--ink-muted)]',
              )}
            >
              {m.id}
            </span>
            <span className="font-medium">{m.name}</span>
            <span
              className={cn(
                'inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                live
                  ? 'bg-[var(--ok-soft)] text-[color:var(--ok)]'
                  : 'bg-[var(--line-soft)] text-[color:var(--ink-muted)]',
              )}
            >
              {live ? 'Live' : 'Stub'}
            </span>
            {active && (
              <motion.div
                layoutId="method-tab-underline"
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-[var(--accent)]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
