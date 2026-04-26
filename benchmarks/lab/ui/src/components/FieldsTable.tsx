import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Span } from '@/lib/types'
import { Lock, Info } from 'lucide-react'

type Props = {
  spans: Span[]
  values: Record<string, string>
  onChange: (id: string, value: string) => void
  readonly?: boolean
  notes?: string[]
}

export default function FieldsTable({ spans, values, onChange, readonly = false, notes = [] }: Props) {
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
    <div className="flex flex-col gap-3 min-h-0 sticky top-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-1">
          Detected fields
        </div>
        <div className="text-[14px] text-[color:var(--ink-soft)]">
          <span className="text-[color:var(--ink)] font-semibold">{spans.length}</span> spans ·{' '}
          <span className="text-[color:var(--accent-ink)] font-medium">{editableCount}</span> editable
          {arabicCount > 0 && (
            <span className="text-[color:var(--ink-muted)]"> · {arabicCount} Arabic</span>
          )}
        </div>
      </div>

      {notes.length > 0 && (
        <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-3 flex gap-2">
          <Info className="size-3.5 shrink-0 mt-0.5 text-[color:var(--accent-ink)]" />
          <ul className="text-[12px] text-[color:var(--ink-soft)] leading-relaxed space-y-1">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {!readonly && (
        <div className="text-[12px] text-[color:var(--ink-muted)] leading-relaxed">
          Type a new value into any editable row. Edited rows highlight; click <span className="font-medium text-[color:var(--ink-soft)]">Generate</span> to apply.
        </div>
      )}

      <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] overflow-hidden max-h-[680px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] bg-[var(--line-soft)]">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium w-10">p</th>
              <th className="px-3 py-2 font-medium">Original</th>
              <th className="px-3 py-2 font-medium">{readonly ? 'Status' : 'New value'}</th>
            </tr>
          </thead>
          <tbody>
            {grouped.flatMap(([pageIdx, rows]) =>
              rows.map((s) => {
                const val = values[s.id] ?? ''
                const dirty = !readonly && val !== '' && val !== s.text
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-t border-[color:var(--line-soft)] transition-colors',
                      dirty && 'bg-[var(--accent-soft)]',
                    )}
                  >
                    <td className="px-3 py-2 text-[color:var(--ink-muted)] tabular-nums">
                      {pageIdx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="font-mono"
                        style={{ color: rgb01(s.color), direction: s.is_arabic ? 'rtl' : 'ltr' }}
                      >
                        {s.text}
                      </span>
                      <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                        {s.font || '—'} · {s.fontsize.toFixed(1)}pt
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {readonly ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] uppercase tracking-wider rounded px-1.5 py-0.5',
                            s.editable
                              ? 'bg-[var(--ok-soft)] text-[color:var(--ok)]'
                              : 'bg-[var(--line-soft)] text-[color:var(--ink-muted)]',
                          )}
                        >
                          {s.editable ? 'editable' : 'locked'}
                        </span>
                      ) : s.editable ? (
                        <input
                          value={val}
                          placeholder={s.text}
                          onChange={(e) => onChange(s.id, e.target.value)}
                          className={cn(
                            'w-full px-2 py-1 rounded font-mono text-[13px] bg-white',
                            'border focus:outline-none focus:ring-1',
                            dirty
                              ? 'border-[color:var(--accent)] focus:ring-[var(--accent)]'
                              : 'border-[color:var(--line)] focus:ring-[color:var(--ink-soft)]',
                          )}
                        />
                      ) : (
                        <div className="inline-flex items-center gap-1 text-[12px] text-[color:var(--ink-muted)]">
                          <Lock className="size-3" /> locked
                        </div>
                      )}
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
