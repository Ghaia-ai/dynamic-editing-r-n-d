import type { Sample } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  samples: Sample[]
  selected: string | null
  onSelect: (name: string) => void
}

export default function SamplePicker({ samples, selected, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] uppercase tracking-wider text-[color:var(--ink-muted)] mr-1">
        Sample
      </span>
      <div className="inline-flex rounded-md border border-[color:var(--line)] bg-[var(--surface)] overflow-hidden">
        {samples.map((s, i) => {
          const isActive = selected === s.name
          return (
            <button
              key={s.name}
              onClick={() => onSelect(s.name)}
              className={cn(
                'px-3 py-1.5 text-[13px] transition-colors',
                i > 0 && 'border-l border-[color:var(--line)]',
                isActive
                  ? 'bg-[var(--accent-soft)] text-[color:var(--accent-ink)]'
                  : 'text-[color:var(--ink-soft)] hover:bg-[var(--line-soft)]',
              )}
            >
              <span className="font-medium">{prettyName(s.name)}</span>
              <span className="ml-1.5 text-[11px] text-[color:var(--ink-muted)]">{s.page_count}p</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function prettyName(filename: string) {
  return filename.replace(/\.pdf$/i, '').replace(/_/g, ' ')
}
