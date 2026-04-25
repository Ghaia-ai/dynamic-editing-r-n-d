import type { Sample } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FileText } from 'lucide-react'

type Props = {
  samples: Sample[]
  selected: string | null
  onSelect: (name: string) => void
}

export default function SamplePicker({ samples, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {samples.map((s) => {
        const isActive = selected === s.name
        return (
          <button
            key={s.name}
            onClick={() => onSelect(s.name)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
              isActive
                ? 'border-amber-500 bg-amber-500/10 text-amber-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800',
            )}
          >
            <FileText className="size-4 shrink-0" />
            <span className="font-medium">{s.name}</span>
            <span className="text-xs text-zinc-500">{s.page_count}p</span>
          </button>
        )
      })}
    </div>
  )
}
