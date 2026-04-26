import { sampleCropUrl, sessionCropUrl } from '@/lib/api'
import type { ApplyResult } from '@/lib/types'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  sample: string
  sessionId: string
  results: ApplyResult[]
}

export default function ChangesPanel({ sample, sessionId, results }: Props) {
  if (results.length === 0) return null
  const okCount = results.filter((r) => r.ok).length

  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)]">
      <div className="px-4 py-3 border-b border-[color:var(--line)] flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">What changed — zoomed at 300dpi</h3>
        <span className="text-[12px] text-[color:var(--ink-muted)] tabular-nums">
          {okCount} / {results.length} applied
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
        {results.map((r, i) => {
          const ib = (r.trace?.inst_bbox as [number, number, number, number] | undefined) ?? null
          if (!ib) {
            return (
              <div
                key={i}
                className="text-[12px] text-[color:var(--bad)] border border-[color:var(--bad-soft)] bg-[var(--bad-soft)] rounded p-2"
              >
                <XCircle className="size-3 inline mr-1" />
                {r.original_text} → {r.new_text}: {r.error ?? 'no bbox in trace'}
              </div>
            )
          }
          return (
            <div
              key={i}
              className="rounded-md border border-[color:var(--line)] bg-[var(--canvas)] p-3"
            >
              <div className="flex items-center gap-2 text-[12px] mb-2 font-mono">
                {r.ok ? (
                  <CheckCircle2 className="size-3 text-[color:var(--ok)]" />
                ) : (
                  <XCircle className="size-3 text-[color:var(--bad)]" />
                )}
                <span className="text-[color:var(--ink-muted)]">p{r.page + 1}</span>
                <span className="text-[color:var(--ink-soft)]">{r.original_text}</span>
                <ArrowRight className="size-3 text-[color:var(--ink-muted)]" />
                <span className="font-semibold text-[color:var(--accent-ink)]">{r.new_text}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Tile label="Before" url={sampleCropUrl(sample, r.page, ib)} />
                <Tile label="After" url={sessionCropUrl(sessionId, r.page, ib)} highlight={r.ok} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Tile({ label, url, highlight }: { label: string; url: string; highlight?: boolean }) {
  return (
    <div className="relative">
      <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-white/80 backdrop-blur text-[color:var(--ink-soft)]">
        {label}
      </div>
      <img
        src={url}
        alt={label}
        className={cn(
          'block w-full h-auto rounded border bg-white',
          highlight ? 'border-[color:var(--ok)]' : 'border-[color:var(--line)]',
        )}
      />
    </div>
  )
}
