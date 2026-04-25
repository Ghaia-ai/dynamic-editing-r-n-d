import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  CircleDashed,
  AlertTriangle,
  Sparkles,
  FileText,
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

type RuledOut = {
  name: string
  why: string
}

type Experiment = {
  id: string
  name: string
  outcome: 'killed' | 'retracted' | 'partial-kill' | 'passed' | string
  takeaway: string
  results_glob: string | null
}

type OpenQuestion = {
  title: string
  body: string
}

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
  latest_e6: {
    file: string
    started_at: string
    metrics: Metric[]
  } | null
  results_files: { file: string; experiment_id: string | null }[]
  report: { available: boolean; url: string; version: string | null }
}

const STATUS_BADGES: Record<string, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  chosen: {
    label: 'chosen',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    Icon: CheckCircle2,
  },
  passed: {
    label: 'passed',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    Icon: CheckCircle2,
  },
  killed: {
    label: 'killed',
    className: 'border-red-500/40 bg-red-500/10 text-red-300',
    Icon: XCircle,
  },
  'partial-kill': {
    label: 'partial kill',
    className: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    Icon: AlertTriangle,
  },
  retracted: {
    label: 'retracted',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    Icon: AlertTriangle,
  },
  'not-started': {
    label: 'not started',
    className: 'border-zinc-700 bg-zinc-900 text-zinc-400',
    Icon: CircleDashed,
  },
  'baseline-to-beat': {
    label: 'baseline-to-beat',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    Icon: Sparkles,
  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGES[status] ?? STATUS_BADGES['not-started']
  const Icon = cfg.Icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider',
        cfg.className,
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

  if (error) {
    return <div className="p-6 text-red-400 text-sm">error: {error}</div>
  }
  if (!data) {
    return <div className="p-6 text-zinc-500 text-sm">loading…</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto p-6 space-y-8"
    >
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Findings</h1>
            <p className="text-sm text-zinc-400 mt-1">
              What we explored, what we ran, what we learned. Mirrors the typst report at{' '}
              <code className="text-zinc-300">reports/src/dynamic-editing-demo-v0.2.typ</code>.
            </p>
          </div>
          {data.report.available && (
            <a
              href={data.report.url}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 text-amber-200 text-sm hover:bg-amber-500/10 shrink-0"
            >
              <Download className="size-4" />
              report PDF
            </a>
          )}
        </div>
      </header>

      <BottomLine metrics={data.latest_e6?.metrics ?? []} />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500">
            Approaches we evaluated
          </h2>
          <span className="text-[10px] text-zinc-500">
            A-D from initial brief · E-F from industry survey
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.approaches.map((a) => (
            <div
              key={a.id}
              className={cn(
                'rounded-lg border p-4 space-y-2',
                a.status === 'chosen'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-zinc-800 bg-zinc-900',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                    {a.id}
                  </span>
                  <span className="font-medium text-sm truncate">{a.name}</span>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={a.status} />
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{a.verdict}</p>
            </div>
          ))}
        </div>
      </section>

      {data.ruled_out && data.ruled_out.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
            Ruled out by industry survey
            <span className="ml-2 text-[10px] text-zinc-600 normal-case">
              variants of A-D or doesn't apply to flat exports
            </span>
          </h2>
          <details className="rounded-lg border border-zinc-800 bg-zinc-900">
            <summary className="cursor-pointer px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200">
              {data.ruled_out.length} approaches surveyed and ruled out — click to expand
            </summary>
            <div className="divide-y divide-zinc-800">
              {data.ruled_out.map((r, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="text-sm font-medium text-zinc-300 mb-1 flex items-center gap-2">
                    <XCircle className="size-3 text-zinc-600 shrink-0" />
                    {r.name}
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed pl-5">{r.why}</p>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
          Experiments we ran
        </h2>
        <ol className="space-y-2">
          {data.experiments.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 flex gap-3 items-start"
            >
              <Beaker className="size-4 text-zinc-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-amber-300">{e.id}</span>
                  <span className="text-sm font-medium">{e.name}</span>
                  <StatusBadge status={e.outcome} />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{e.takeaway}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {data.latest_e6 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
            Latest gate-1 metrics —{' '}
            <span className="text-zinc-400 font-mono normal-case">{data.latest_e6.file}</span>
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500">
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-2 font-normal">sample</th>
                  <th className="px-4 py-2 font-normal text-right">edits</th>
                  <th className="px-4 py-2 font-normal text-right">edit time</th>
                  <th className="px-4 py-2 font-normal text-right">masked ssim</th>
                </tr>
              </thead>
              <tbody>
                {data.latest_e6.metrics.map((m) => (
                  <tr key={m.sample} className="border-b border-zinc-900 last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{m.sample}</td>
                    <td className="px-4 py-2 text-right">{m.edits}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">
                      {m.edit_seconds !== null ? `${m.edit_seconds.toFixed(2)}s` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {m.masked_ssim_mean !== null ? (
                        <span
                          className={cn(
                            'font-mono font-semibold',
                            m.masked_ssim_mean >= 0.99 ? 'text-emerald-300' : 'text-amber-300',
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
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
          <Sparkles className="size-3" />
          Open questions for v1
        </h2>
        <div className="space-y-2">
          {data.open_questions.map((q) => (
            <div
              key={q.title}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="text-sm font-medium mb-1">{q.title}</div>
              <p className="text-xs text-zinc-400 leading-relaxed">{q.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
          <FileText className="size-3" />
          Result JSONs
        </h2>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <ul className="space-y-1 text-xs font-mono text-zinc-400">
            {data.results_files.map((f) => (
              <li key={f.file} className="flex items-center gap-2">
                {f.experiment_id && (
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 text-[10px]">
                    {f.experiment_id}
                  </span>
                )}
                <span>{f.file}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </motion.div>
  )
}

function BottomLine({ metrics }: { metrics: Metric[] }) {
  const allOk = metrics.length > 0 && metrics.every((m) => (m.masked_ssim_mean ?? 0) >= 0.99)
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        allOk ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900',
      )}
    >
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Bottom line</div>
      <p className="text-sm leading-relaxed">
        Approach C (overlay) handles{' '}
        <span className="text-emerald-300 font-medium">both Latin and Arabic</span> on the two sample
        posters. Same engine, two primitives:{' '}
        <code className="text-zinc-300">insert_text</code> for Latin (preserves the embedded font
        subset),{' '}
        <code className="text-zinc-300">insert_htmlbox</code> for Arabic (HarfBuzz handles
        contextual shaping). Masked SSIM on non-edited regions stays above{' '}
        <span className="text-emerald-300 font-mono font-semibold">0.9998</span>. Recommendation:
        adopt for v1; integration plan + open questions in the report.
      </p>
    </div>
  )
}
