import type { MethodRunResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AlertTriangle, FileCode, Gauge, Info } from 'lucide-react'

type Props = { run: MethodRunResponse }

export default function MethodBPanel({ run }: Props) {
  const r = (run.method_result ?? {}) as {
    backend?: string
    html_size_bytes?: number
    rerendered_pdf_path?: string | null
    convert_seconds?: number
    rerender_seconds?: number
    ssim_per_page?: number[]
    ssim_mean?: number | null
    license_note?: string
  }

  const usingPdfminer = r.backend === 'pdfminer.six'
  const ssimMean = r.ssim_mean ?? null

  return (
    <div className="space-y-6">
      <header className="flex items-baseline gap-3">
        <h2 className="text-[18px] font-semibold tracking-tight">HTML roundtrip</h2>
        <span className="text-[12px] text-[color:var(--ink-muted)]">
          PDF → HTML → re-rendered PDF, with full-page SSIM against the original.
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Backend" value={r.backend ?? '—'} subtle={!r.backend} accent={!usingPdfminer} />
        <Stat
          label="Convert + re-render"
          value={
            r.convert_seconds !== undefined && r.rerender_seconds !== undefined
              ? `${r.convert_seconds.toFixed(2)}s + ${r.rerender_seconds.toFixed(2)}s`
              : '—'
          }
        />
        <Stat
          label="Mean full-page SSIM"
          value={
            ssimMean !== null
              ? ssimMean.toFixed(4)
              : r.rerendered_pdf_path
                ? '—'
                : 'no re-render'
          }
          tone={
            ssimMean !== null
              ? ssimMean >= 0.95
                ? 'ok'
                : ssimMean >= 0.85
                  ? 'warn'
                  : 'bad'
              : 'subtle'
          }
        />
      </div>

      {usingPdfminer && (
        <div className="rounded-md border border-[color:var(--warn-soft)] bg-[var(--warn-soft)] text-[color:var(--warn)] px-4 py-3 flex gap-3 items-start">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div className="text-[13px] leading-relaxed">
            <div className="font-medium mb-0.5">Running with pdfminer.six (fallback)</div>
            <div className="text-[color:var(--ink-soft)]">
              pdf2htmlEX isn't in this image. pdfminer produces semantic HTML so SSIM will look very low — that's expected, not a bug. To run with pdf2htmlEX: ensure the apt package <code className="font-mono text-[12px] bg-white px-1 py-0.5 rounded border border-[color:var(--line)]">pdf2htmlex</code> installed cleanly during build.
            </div>
          </div>
        </div>
      )}

      {r.ssim_per_page && r.ssim_per_page.length > 0 && (
        <Section icon={<Gauge className="size-4" />} title="Per-page fidelity">
          <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] bg-[var(--line-soft)]">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">page</th>
                  <th className="px-4 py-2 font-medium text-right">ssim</th>
                  <th className="px-4 py-2 font-medium">interpretation</th>
                </tr>
              </thead>
              <tbody>
                {r.ssim_per_page.map((s, i) => (
                  <tr key={i} className="border-t border-[color:var(--line-soft)]">
                    <td className="px-4 py-2 tabular-nums">{i + 1}</td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right font-mono tabular-nums',
                        s >= 0.95
                          ? 'text-[color:var(--ok)]'
                          : s >= 0.85
                            ? 'text-[color:var(--warn)]'
                            : 'text-[color:var(--bad)]',
                      )}
                    >
                      {s.toFixed(4)}
                    </td>
                    <td className="px-4 py-2 text-[12px] text-[color:var(--ink-muted)]">
                      {interpret(s)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section icon={<FileCode className="size-4" />} title="License note">
        <p className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed">
          {r.license_note ?? 'License unknown.'}
        </p>
      </Section>

      {run.notes.length > 0 && (
        <Section icon={<Info className="size-4" />} title="Run notes">
          <ul className="text-[12px] text-[color:var(--ink-muted)] space-y-1">
            {run.notes.map((n, i) => (
              <li key={i}>— {n}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function interpret(s: number): string {
  if (s >= 0.98) return 'visually identical'
  if (s >= 0.95) return 'minor differences'
  if (s >= 0.85) return 'noticeable drift (font fallback / spacing)'
  if (s >= 0.6) return 'significant fidelity loss'
  return 'effectively a different rendering'
}

function Stat({
  label,
  value,
  tone = 'default',
  accent,
  subtle,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'bad' | 'subtle' | 'default'
  accent?: boolean
  subtle?: boolean
}) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-1">
        {label}
      </div>
      <div
        className={cn(
          'text-[18px] font-semibold tabular-nums',
          tone === 'ok' && 'text-[color:var(--ok)]',
          tone === 'warn' && 'text-[color:var(--warn)]',
          tone === 'bad' && 'text-[color:var(--bad)]',
          tone === 'subtle' && 'text-[color:var(--ink-muted)]',
          accent && 'text-[color:var(--accent-ink)]',
          subtle && 'text-[color:var(--ink-muted)]',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-2">
        {icon}
        {title}
      </div>
      {children}
    </section>
  )
}
