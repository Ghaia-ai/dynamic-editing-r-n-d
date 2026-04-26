import type { MethodRunResponse } from '@/lib/types'
import { AlertTriangle, KeyRound, Wand2 } from 'lucide-react'

type Props = { run: MethodRunResponse }

export default function MethodEPanel({ run }: Props) {
  const r = (run.method_result ?? {}) as {
    live?: boolean
    configured?: boolean
    vendor?: string
    model?: string
    elapsed_seconds?: number
    bbox?: number[]
    new_text?: string
    page_image_base64?: string
    mask_image_base64?: string | null
    result_image_url?: string | null
    estimated_cost_usd?: number
    message?: string
  }

  const hasPage = !!r.page_image_base64

  return (
    <div className="space-y-6">
      <header className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[18px] font-semibold tracking-tight">Diffusion glyph inpainting</h2>
        <span className="text-[12px] text-[color:var(--ink-muted)]">
          stable-diffusion-inpainting on Replicate. Editing <code className="font-mono">{r.new_text ?? '—'}</code> at the bbox shown.
        </span>
      </header>

      {!r.configured && (
        <div className="rounded-md border border-[color:var(--accent-soft)] bg-[var(--accent-soft)] text-[color:var(--accent-ink)] px-5 py-4 flex gap-3 items-start">
          <KeyRound className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-[14px] font-semibold">Set REPLICATE_API_TOKEN to enable live inpainting</div>
            <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
              {r.message ??
                'Replicate runs the model on their GPUs and bills per second. Typical cost ~$0.012 per inpaint call. Get a token at replicate.com/account/api-tokens.'}
            </p>
            <p className="text-[12px] mt-2 text-[color:var(--ink-muted)]">
              The lab still shows you exactly what it would have submitted: the rendered page on the left, the binary mask on the right.
            </p>
          </div>
        </div>
      )}

      {r.configured && !r.live && (
        <div className="rounded-md border border-[color:var(--bad-soft)] bg-[var(--bad-soft)] text-[color:var(--bad)] px-5 py-4 flex gap-3 items-start">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div>
            <div className="text-[14px] font-semibold">Replicate call failed</div>
            <p className="text-[13px] mt-1 text-[color:var(--ink-soft)] leading-relaxed">
              {r.message ?? 'Unknown error.'}
            </p>
          </div>
        </div>
      )}

      {hasPage && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ImageTile
            label="Source page"
            src={`data:image/png;base64,${r.page_image_base64}`}
          />
          {r.mask_image_base64 && (
            <ImageTile
              label="Mask submitted"
              src={`data:image/png;base64,${r.mask_image_base64}`}
              tone="dark"
            />
          )}
          {r.result_image_url && (
            <ImageTile
              label={`Inpainted result${r.estimated_cost_usd ? ` · ~$${r.estimated_cost_usd.toFixed(3)}` : ''}`}
              src={r.result_image_url}
              accent
            />
          )}
        </div>
      )}

      {r.live && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Vendor" value={r.vendor ?? 'replicate'} />
          <Stat label="Model" value={(r.model ?? '').split('/').pop() || '—'} />
          <Stat
            label="Elapsed"
            value={r.elapsed_seconds !== undefined ? `${r.elapsed_seconds.toFixed(2)}s` : '—'}
          />
          <Stat
            label="Estimated cost"
            value={r.estimated_cost_usd ? `~$${r.estimated_cost_usd.toFixed(3)}` : '—'}
          />
        </div>
      )}

      {run.notes.length > 0 && (
        <div className="border-t border-[color:var(--line)] pt-3">
          <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-2 flex items-center gap-2">
            <Wand2 className="size-3.5" />
            Notes
          </div>
          <ul className="text-[12px] text-[color:var(--ink-muted)] space-y-1">
            {run.notes.map((n, i) => (
              <li key={i}>— {n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ImageTile({
  label,
  src,
  tone,
  accent,
}: {
  label: string
  src: string
  tone?: 'dark'
  accent?: boolean
}) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)]">
        {label}
      </div>
      <div
        className={
          'rounded-md border border-[color:var(--line)] overflow-hidden ' +
          (tone === 'dark'
            ? 'bg-black'
            : accent
              ? 'bg-[var(--accent-soft)]'
              : 'bg-white')
        }
      >
        <img src={src} className="block w-full h-auto" alt={label} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-1">
        {label}
      </div>
      <div className="text-[14px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}
