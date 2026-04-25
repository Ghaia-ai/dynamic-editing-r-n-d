import { sampleCropUrl, sessionCropUrl } from '@/lib/api'
import type { ApplyResult } from '@/lib/types'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'

type Props = {
  sample: string
  sessionId: string
  results: ApplyResult[]
}

export default function ChangesPanel({ sample, sessionId, results }: Props) {
  if (results.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs uppercase tracking-wider text-amber-200/80 font-medium">
          What changed — zoomed at 300dpi
        </div>
        <div className="text-xs text-zinc-500">
          {results.filter((r) => r.ok).length} of {results.length} applied
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.map((r, i) => {
          const ib = (r.trace?.inst_bbox as [number, number, number, number] | undefined) ?? null
          if (!ib) {
            return (
              <div key={i} className="text-xs text-red-400 border border-red-900 rounded p-2">
                <XCircle className="size-3 inline mr-1" />
                {r.original_text} → {r.new_text}: {r.error ?? 'no bbox in trace'}
              </div>
            )
          }
          return (
            <div key={i} className="rounded-md bg-zinc-950 border border-zinc-800 p-2">
              <div className="flex items-center gap-2 text-xs text-zinc-300 mb-2 font-mono">
                {r.ok ? (
                  <CheckCircle2 className="size-3 text-emerald-400" />
                ) : (
                  <XCircle className="size-3 text-red-400" />
                )}
                <span>p{r.page + 1}</span>
                <span className="text-zinc-500">{r.original_text}</span>
                <ArrowRight className="size-3 text-zinc-600" />
                <span className="text-amber-300">{r.new_text}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <CropTile label="before" url={sampleCropUrl(sample, r.page, ib)} />
                <CropTile label="after" url={sessionCropUrl(sessionId, r.page, ib)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CropTile({ label, url }: { label: string; url: string }) {
  return (
    <div className="relative">
      <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-black/60 text-zinc-200">
        {label}
      </div>
      <img
        src={url}
        alt={label}
        className="block w-full h-auto rounded border border-zinc-800 bg-white"
      />
    </div>
  )
}
