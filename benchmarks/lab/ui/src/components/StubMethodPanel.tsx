import { motion } from 'framer-motion'
import { Lock, AlertTriangle, FlaskConical, Sparkles } from 'lucide-react'
import type { MethodDef, MethodRunResponse } from '@/lib/types'

type Props = {
  method: MethodDef
  run: MethodRunResponse
}

export default function StubMethodPanel({ method, run }: Props) {
  const e = run.evidence
  if (!e) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto"
    >
      <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)]">
        <div className="px-6 py-5 border-b border-[color:var(--line)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-[var(--line-soft)] text-[12px] font-mono text-[color:var(--ink-soft)]">
              {method.id}
            </span>
            <h2 className="text-[18px] font-semibold tracking-tight">{method.name}</h2>
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--line-soft)] text-[color:var(--ink-muted)]">
              <Lock className="size-3" />
              not wired in lab
            </span>
          </div>
          <p className="text-[14px] text-[color:var(--ink-soft)] leading-relaxed">{e.tagline}</p>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          <Section icon={<FlaskConical className="size-4" />} title="What would run">
            {e.what_runs}
          </Section>
          <Section icon={<Sparkles className="size-4" />} title="What lab shows now">
            {e.what_lab_shows}
          </Section>
          <Section icon={<AlertTriangle className="size-4" />} title="Limits">
            {e.limits}
          </Section>
          <Section title="Verdict" emphasis>
            {e.verdict}
          </Section>
        </div>

        {run.notes.length > 0 && (
          <div className="px-6 py-3 border-t border-[color:var(--line)] bg-[var(--canvas)]">
            <ul className="text-[12px] text-[color:var(--ink-muted)] space-y-1">
              {run.notes.map((n, i) => (
                <li key={i}>— {n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function Section({
  icon,
  title,
  emphasis,
  children,
}: {
  icon?: React.ReactNode
  title: string
  emphasis?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)]">
        {icon}
        {title}
      </div>
      <p
        className={
          emphasis
            ? 'text-[14px] text-[color:var(--ink)] leading-relaxed font-medium'
            : 'text-[13px] text-[color:var(--ink-soft)] leading-relaxed'
        }
      >
        {children}
      </p>
    </div>
  )
}
