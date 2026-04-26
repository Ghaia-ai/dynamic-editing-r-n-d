import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  CircleDashed,
  AlertTriangle,
  Sparkles,
  Download,
  Beaker,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Approach = {
  id: string
  name: string
  status: 'killed' | 'not-started' | 'chosen' | 'baseline-to-beat' | string
  verdict: string
}

type RuledOut = { name: string; why: string }

type Experiment = {
  id: string
  name: string
  outcome: 'killed' | 'retracted' | 'partial-kill' | 'passed' | string
  takeaway: string
  results_glob: string | null
}

type OpenQuestion = { title: string; body: string }

type Metric = {
  sample: string
  edits: number
  edit_seconds: number | null
  masked_ssim_mean: number | null
}

type FindingsResponse = {
  approaches: Approach[]
  ruled_out: RuledOut[]
  experiments: Experiment[]
  open_questions: OpenQuestion[]
  latest_e6: { file: string; started_at: string; metrics: Metric[] } | null
  results_files: { file: string; experiment_id: string | null }[]
  report: { available: boolean; url: string; version: string | null }
}

const STATUS: Record<string, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  chosen: {
    label: 'chosen',
    tone: 'bg-[var(--ok-soft)] text-[color:var(--ok)] border-[color:var(--ok-soft)]',
    Icon: CheckCircle2,
  },
  passed: {
    label: 'passed',
    tone: 'bg-[var(--ok-soft)] text-[color:var(--ok)] border-[color:var(--ok-soft)]',
    Icon: CheckCircle2,
  },
  killed: {
    label: 'killed',
    tone: 'bg-[var(--bad-soft)] text-[color:var(--bad)] border-[color:var(--bad-soft)]',
    Icon: XCircle,
  },
  'partial-kill': {
    label: 'partial kill',
    tone: 'bg-[var(--warn-soft)] text-[color:var(--warn)] border-[color:var(--warn-soft)]',
    Icon: AlertTriangle,
  },
  retracted: {
    label: 'retracted',
    tone: 'bg-[var(--warn-soft)] text-[color:var(--warn)] border-[color:var(--warn-soft)]',
    Icon: AlertTriangle,
  },
  'not-started': {
    label: 'not started',
    tone: 'bg-[var(--line-soft)] text-[color:var(--ink-muted)] border-[color:var(--line)]',
    Icon: CircleDashed,
  },
  'baseline-to-beat': {
    label: 'baseline to beat',
    tone: 'bg-[var(--accent-soft)] text-[color:var(--accent-ink)] border-[color:var(--accent-soft)]',
    Icon: Sparkles,
  },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS[status] ?? STATUS['not-started']
  const Icon = cfg.Icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider border',
        cfg.tone,
      )}
    >
      <Icon className="size-3" />
      {cfg.label}
    </span>
  )
}

export default function Findings() {
  const [data, setData] = useState<FindingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/findings')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  if (error)
    return (
      <div className="max-w-[900px] mx-auto px-8 py-8 text-[13px] text-[color:var(--bad)]">
        error: {error}
      </div>
    )
  if (!data)
    return (
      <div className="max-w-[900px] mx-auto px-8 py-8 text-[13px] text-[color:var(--ink-muted)]">
        loading…
      </div>
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1000px] mx-auto px-8 py-8 space-y-10"
    >
      <header className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Findings</h1>
          <p className="text-[13px] text-[color:var(--ink-muted)] mt-1">
            What we explored, what we ran, what we learned. The lab tab tests the live ones; this
            tab summarises everything.
          </p>
        </div>
        {data.report.available && (
          <a
            href={data.report.url}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] border border-[color:var(--line)] bg-[var(--surface)] hover:bg-[var(--line-soft)] shrink-0"
          >
            <Download className="size-4" />
            Report PDF
          </a>
        )}
      </header>

      <BottomLine metrics={data.latest_e6?.metrics ?? []} />

      <Section title="Approaches we evaluated" hint="A–D from the brief · E–F from the survey">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.approaches.map((a) => (
            <div
              key={a.id}
              className={cn(
                'rounded-md border bg-[var(--surface)] p-4 space-y-2',
                a.status === 'chosen'
                  ? 'border-[color:var(--ok)]'
                  : 'border-[color:var(--line)]',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[12px] px-2 py-0.5 rounded bg-[var(--line-soft)] text-[color:var(--ink-soft)] shrink-0">
                    {a.id}
                  </span>
                  <span className="font-medium text-[14px] truncate">{a.name}</span>
                </div>
                <StatusPill status={a.status} />
              </div>
              <p className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed">{a.verdict}</p>
            </div>
          ))}
        </div>
      </Section>

      {data.ruled_out && data.ruled_out.length > 0 && (
        <Section
          title="Ruled out by industry survey"
          hint="variants of A–D or doesn't apply to flat exports"
        >
          <details className="rounded-md border border-[color:var(--line)] bg-[var(--surface)]">
            <summary className="cursor-pointer px-4 py-3 text-[13px] text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]">
              {data.ruled_out.length} approaches surveyed and ruled out — click to expand
            </summary>
            <div className="divide-y divide-[color:var(--line)]">
              {data.ruled_out.map((r, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="text-[13px] font-medium mb-1 flex items-center gap-2">
                    <XCircle className="size-3 text-[color:var(--ink-muted)]" />
                    {r.name}
                  </div>
                  <p className="text-[12px] text-[color:var(--ink-muted)] leading-relaxed pl-5">
                    {r.why}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </Section>
      )}

      <Section title="Experiments we ran">
        <ol className="space-y-2">
          {data.experiments.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-3 flex gap-3 items-start"
            >
              <Beaker className="size-4 text-[color:var(--ink-muted)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-[12px] text-[color:var(--accent-ink)]">{e.id}</span>
                  <span className="text-[14px] font-medium">{e.name}</span>
                  <StatusPill status={e.outcome} />
                </div>
                <p className="text-[12px] text-[color:var(--ink-soft)] leading-relaxed">{e.takeaway}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {data.latest_e6 && (
        <Section
          title="Latest gate-1 metrics"
          hint={data.latest_e6.file}
        >
          <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] bg-[var(--line-soft)]">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">sample</th>
                  <th className="px-4 py-2 font-medium text-right">edits</th>
                  <th className="px-4 py-2 font-medium text-right">edit time</th>
                  <th className="px-4 py-2 font-medium text-right">masked ssim</th>
                </tr>
              </thead>
              <tbody>
                {data.latest_e6.metrics.map((m) => (
                  <tr
                    key={m.sample}
                    className="border-t border-[color:var(--line-soft)] last:border-b-0"
                  >
                    <td className="px-4 py-2 font-mono text-[12px]">{m.sample}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.edits}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[color:var(--ink-muted)]">
                      {m.edit_seconds !== null ? `${m.edit_seconds.toFixed(2)}s` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {m.masked_ssim_mean !== null ? (
                        <span
                          className={cn(
                            'font-mono font-semibold tabular-nums',
                            m.masked_ssim_mean >= 0.99
                              ? 'text-[color:var(--ok)]'
                              : 'text-[color:var(--warn)]',
                          )}
                        >
                          {m.masked_ssim_mean.toFixed(5)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Open questions for v1">
        <div className="space-y-2">
          {data.open_questions.map((q) => (
            <div
              key={q.title}
              className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-3"
            >
              <div className="text-[13px] font-medium mb-1">{q.title}</div>
              <p className="text-[12px] text-[color:var(--ink-soft)] leading-relaxed">{q.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Result JSONs">
        <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] p-3">
          <ul className="space-y-1 text-[12px] font-mono text-[color:var(--ink-soft)]">
            {data.results_files.map((f) => (
              <li key={f.file} className="flex items-center gap-2">
                {f.experiment_id && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--line-soft)] text-[color:var(--accent-ink)] text-[10px]">
                    {f.experiment_id}
                  </span>
                )}
                <span>{f.file}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </motion.div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] font-medium">
          {title}
        </h2>
        {hint && <span className="text-[11px] text-[color:var(--ink-muted)]">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function BottomLine({ metrics }: { metrics: Metric[] }) {
  const allOk = metrics.length > 0 && metrics.every((m) => (m.masked_ssim_mean ?? 0) >= 0.99)
  return (
    <div
      className={cn(
        'rounded-md border p-5',
        allOk ? 'border-[color:var(--ok)] bg-[var(--ok-soft)]' : 'border-[color:var(--line)] bg-[var(--surface)]',
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-2">
        Bottom line
      </div>
      <p className="text-[14px] leading-relaxed text-[color:var(--ink)]">
        Approach C (overlay) handles{' '}
        <span className="font-semibold text-[color:var(--ok)]">both Latin and Arabic</span> on the two
        sample posters. Same engine, two primitives:{' '}
        <code className="text-[12px] bg-white px-1 py-0.5 rounded border border-[color:var(--line)]">
          insert_text
        </code>{' '}
        for Latin (preserves the embedded font subset),{' '}
        <code className="text-[12px] bg-white px-1 py-0.5 rounded border border-[color:var(--line)]">
          insert_htmlbox
        </code>{' '}
        for Arabic (HarfBuzz handles contextual shaping). Masked SSIM on non-edited regions stays above{' '}
        <span className="font-mono font-semibold text-[color:var(--ok)]">0.9998</span>. Recommendation:
        adopt for v1; integration plan + open questions in the report.
      </p>
    </div>
  )
}
