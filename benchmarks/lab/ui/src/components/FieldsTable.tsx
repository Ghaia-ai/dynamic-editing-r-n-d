import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Span } from '@/lib/types'
import { Lock } from 'lucide-react'

type Props = {
  spans: Span[]
  values: Record<string, string>
  onChange: (id: string, value: string) => void
}

export default function FieldsTable({ spans, values, onChange }: Props) {
  const grouped = useMemo(() => {
    const out = new Map<number, Span[]>()
    for (const s of spans) {
      if (!out.has(s.page)) out.set(s.page, [])
      out.get(s.page)!.push(s)
    }
    return Array.from(out.entries()).sort((a, b) => a[0] - b[0])
  }, [spans])

  const editableCount = spans.filter((s) => s.editable).length
  const arabicCount = spans.filter((s) => s.is_arabic).length

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">Detected fields</div>
          <div className="text-sm text-zinc-300">
            <span className="text-amber-300 font-medium">{editableCount}</span> editable
            {arabicCount > 0 && (
              <span className="text-zinc-500">
                {' '}
                · {arabicCount} arabic (shaping unsupported)
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="text-xs text-zinc-500 sticky top-0 bg-zinc-950">
            <tr className="text-left">
              <th className="px-3 py-2 font-normal border-b border-zinc-800">page</th>
              <th className="px-3 py-2 font-normal border-b border-zinc-800">original</th>
              <th className="px-3 py-2 font-normal border-b border-zinc-800">new value</th>
              <th className="px-3 py-2 font-normal border-b border-zinc-800">font</th>
            </tr>
          </thead>
          <tbody>
            {grouped.flatMap(([page, rows]) =>
              rows.map((s) => {
                const val = values[s.id] ?? ''
                const dirty = val !== '' && val !== s.text
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'transition-colors',
                      dirty ? 'bg-amber-500/5' : '',
                      !s.editable && 'opacity-50',
                    )}
                  >
                    <td className="px-3 py-1.5 text-zinc-500 border-b border-zinc-900 align-middle">
                      {page + 1}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-900 align-middle font-mono">
                      <span style={{ color: rgb01(s.color) }}>{s.text}</span>
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-900 align-middle">
                      {s.editable ? (
                        <input
                          value={val}
                          placeholder={s.text}
                          onChange={(e) => onChange(s.id, e.target.value)}
                          className={cn(
                            'w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-800',
                            'font-mono text-sm focus:outline-none focus:ring-1',
                            dirty ? 'focus:ring-amber-500 border-amber-500/50' : 'focus:ring-zinc-600',
                          )}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-zinc-500 text-xs">
                          <Lock className="size-3" />
                          locked
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-900 align-middle text-xs text-zinc-500">
                      {s.font || '—'}
                      <span className="text-zinc-700"> · {s.fontsize.toFixed(1)}pt</span>
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function rgb01(c: [number, number, number]) {
  const r = Math.round(c[0] * 255)
  const g = Math.round(c[1] * 255)
  const b = Math.round(c[2] * 255)
  return `rgb(${r} ${g} ${b})`
}
