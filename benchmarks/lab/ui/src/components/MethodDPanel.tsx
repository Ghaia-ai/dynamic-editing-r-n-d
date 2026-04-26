import type { MethodRunResponse } from '@/lib/types'
import { samplePagePngUrl } from '@/lib/api'
import { AlertTriangle, KeyRound, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Field = {
  bbox?: [number, number, number, number]
  bbox_normalized?: [number, number, number, number]
  text: string
  kind: string
  is_arabic?: boolean
  editable_confidence: number
}

type Props = { run: MethodRunResponse }

export default function MethodDPanel({ run }: Props) {
  const r = (run.method_result ?? {}) as {
    live?: boolean
    configured?: boolean
    vendor?: string
    model?: string
    page_index?: number
    elapsed_seconds?: number
    tokens_input?: number | null
    tokens_output?: number | null
    fields?: Field[]
    field_count?: number
    message?: string
  }

  const fields = r.fields ?? []
  const pageIdx = r.page_index ?? 0
  const pageSize = run.page_sizes[pageIdx] ?? [0, 0]

  return (
    <div className="space-y-6">
      <header className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[18px] font-semibold tracking-tight">Layout-AI</h2>
        <span className="text-[12px] text-[color:var(--ink-muted)]">
          {r.vendor === 'gemini' ? 'Gemini 2.5 Flash' : (r.vendor ?? 'vision LLM')} on rendered page {pageIdx + 1}.
        </span>
      </header>

      {!r.configured ? (
        <div className="rounded-md border border-[color:var(--accent-soft)] bg-[var(--accent-soft)] text-[color:var(--accent-ink)] px-5 py-4 flex gap-3 items-start">
          <KeyRound className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-[14px] font-semibold">Set GEMINI_API_KEY to enable live detection</div>
            <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
              {r.message ??
                'Add the key to .env (free tier at aistudio.google.com/apikey) and run this method again. The lab picks up the key on the next request.'}
            </p>
          </div>
        </div>
      ) : !r.live ? (
        <div className="rounded-md border border-[color:var(--bad-soft)] bg-[var(--bad-soft)] text-[color:var(--bad)] px-5 py-4 flex gap-3 items-start">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div>
            <div className="text-[14px] font-semibold">Detector call failed</div>
            <p className="text-[13px] mt-1 text-[color:var(--ink-soft)] leading-relaxed">
              {r.message ?? 'Unknown error.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Detected fields" value={String(r.field_count ?? fields.length)} accent />
            <Stat
              label="Latency"
              value={r.elapsed_seconds !== undefined ? `${r.elapsed_seconds.toFixed(2)}s` : '—'}
            />
            <Stat label="Input tokens" value={r.tokens_input !== null ? String(r.tokens_input) : '—'} />
            <Stat label="Output tokens" value={r.tokens_output !== null ? String(r.tokens_output) : '—'} />
          </div>

          <section>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-2">
              <Sparkles className="size-4" />
              Fields detected on the page
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-4">
              <div className="relative rounded-md border border-[color:var(--line)] bg-white overflow-hidden">
                <div className="relative inline-block w-full">
                  <img
                    src={samplePagePngUrl(run.sample, pageIdx, 150)}
                    className="block w-full h-auto"
                    alt={`page ${pageIdx + 1}`}
                  />
                  {fields.map((f, i) => {
                    const bb = f.bbox ?? toBboxPt(f.bbox_normalized, pageSize)
                    if (!bb || pageSize[0] === 0) return null
                    const [x0, y0, x1, y1] = bb
                    const conf = f.editable_confidence
                    const color =
                      conf >= 0.7
                        ? 'var(--accent)'
                        : conf >= 0.4
                          ? 'var(--warn)'
                          : 'var(--ink-muted)'
                    return (
                      <div
                        key={i}
                        className="absolute pointer-events-none rounded-[2px]"
                        style={{
                          left: `${(x0 / pageSize[0]) * 100}%`,
                          top: `${(y0 / pageSize[1]) * 100}%`,
                          width: `${((x1 - x0) / pageSize[0]) * 100}%`,
                          height: `${((y1 - y0) / pageSize[1]) * 100}%`,
                          outline: `1.5px solid ${color}`,
                          boxShadow: `inset 0 0 0 9999px color-mix(in srgb, ${color} 16%, transparent)`,
                        }}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] overflow-hidden max-h-[640px] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] bg-[var(--line-soft)]">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">text</th>
                      <th className="px-3 py-2 font-medium">kind</th>
                      <th className="px-3 py-2 font-medium text-right">conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, i) => (
                      <tr key={i} className="border-t border-[color:var(--line-soft)]">
                        <td
                          className="px-3 py-2 font-mono"
                          style={{ direction: f.is_arabic ? 'rtl' : 'ltr' }}
                        >
                          {f.text}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[color:var(--ink-muted)]">
                          {f.kind}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right font-mono tabular-nums',
                            f.editable_confidence >= 0.7
                              ? 'text-[color:var(--accent-ink)]'
                              : f.editable_confidence >= 0.4
                                ? 'text-[color:var(--warn)]'
                                : 'text-[color:var(--ink-muted)]',
                          )}
                        >
                          {f.editable_confidence.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {run.notes.length > 0 && (
        <ul className="text-[12px] text-[color:var(--ink-muted)] space-y-1 border-t border-[color:var(--line)] pt-3">
          {run.notes.map((n, i) => (
            <li key={i}>— {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function toBboxPt(
  bn: [number, number, number, number] | undefined,
  pageSize: [number, number],
): [number, number, number, number] | null {
  if (!bn || bn.length !== 4) return null
  return [bn[0] * pageSize[0], bn[1] * pageSize[1], bn[2] * pageSize[0], bn[3] * pageSize[1]]
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-1">
        {label}
      </div>
      <div
        className={cn(
          'text-[18px] font-semibold tabular-nums',
          accent && 'text-[color:var(--accent-ink)]',
        )}
      >
        {value}
      </div>
    </div>
  )
}
