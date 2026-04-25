import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, Download, RotateCw, Loader2 } from 'lucide-react'
import {
  apply,
  detect,
  listSamples,
  samplePagePngUrl,
  sessionPagePngUrl,
  sessionPdfUrl,
} from '@/lib/api'
import type { ApplyResponse, DetectResponse, Sample } from '@/lib/types'
import { cn } from '@/lib/utils'
import SamplePicker from './SamplePicker'
import PdfPreview from './PdfPreview'
import FieldsTable from './FieldsTable'

type RunState = 'idle' | 'detecting' | 'ready' | 'applying' | 'done' | 'error'

export default function Lab() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detectResp, setDetectResp] = useState<DetectResponse | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [applyResp, setApplyResp] = useState<ApplyResponse | null>(null)
  const [state, setState] = useState<RunState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSamples()
      .then((r) => {
        setSamples(r.samples)
        if (r.samples.length > 0 && !selected) setSelected(r.samples[0].name)
      })
      .catch((e) => setError(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selected) return
    setState('detecting')
    setApplyResp(null)
    setValues({})
    setError(null)
    detect(selected)
      .then((d) => {
        setDetectResp(d)
        setState('ready')
      })
      .catch((e) => {
        setError(String(e))
        setState('error')
      })
  }, [selected])

  const dirtyEdits = useMemo(() => {
    if (!detectResp) return []
    return detectResp.spans
      .filter((s) => s.editable)
      .map((s) => {
        const v = values[s.id]
        if (v === undefined || v === '' || v === s.text) return null
        return { page: s.page, bbox: s.bbox, original_text: s.text, new_text: v }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [detectResp, values])

  const dirtyHighlights = useMemo(() => {
    if (!detectResp) return []
    return detectResp.spans
      .filter((s) => {
        const v = values[s.id]
        return v !== undefined && v !== '' && v !== s.text
      })
      .map((s) => ({ page: s.page, bbox: s.bbox }))
  }, [detectResp, values])

  const onApply = async () => {
    if (!selected || dirtyEdits.length === 0) return
    setState('applying')
    setError(null)
    try {
      const r = await apply(selected, dirtyEdits)
      setApplyResp(r)
      setState('done')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }

  const onReset = () => {
    setValues({})
    setApplyResp(null)
    setState(detectResp ? 'ready' : 'idle')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Dynamic PDF Editing Lab</h1>
            <p className="text-xs text-zinc-500">
              Approach C (overlay) · phase-3 demo · backed by the npc-pr-agent overlay engine
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              disabled={state === 'detecting' || state === 'applying'}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900 text-sm hover:bg-zinc-800 disabled:opacity-40"
            >
              <RotateCw className="size-4" /> reset
            </button>
            <button
              onClick={onApply}
              disabled={dirtyEdits.length === 0 || state === 'applying'}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                dirtyEdits.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
              )}
            >
              {state === 'applying' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              generate ({dirtyEdits.length})
            </button>
            {applyResp && (
              <a
                href={sessionPdfUrl(applyResp.session_id)}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 text-amber-200 text-sm hover:bg-amber-500/10"
              >
                <Download className="size-4" /> download
              </a>
            )}
          </div>
        </div>
        <div className="px-6 pb-3">
          <SamplePicker samples={samples} selected={selected} onSelect={setSelected} />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-0">
        <section className="flex flex-col gap-3 min-h-0">
          <AnimatePresence mode="wait">
            {applyResp ? (
              <motion.div
                key="edited"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col gap-3 h-full min-h-0"
              >
                <div className="grid grid-cols-2 gap-4 h-full min-h-0">
                  {detectResp && (
                    <PdfPreview
                      label="Original"
                      pageCount={detectResp.page_count}
                      pngUrlForPage={(p) => samplePagePngUrl(selected!, p)}
                      pageSizesPt={detectResp.page_sizes}
                      highlightBboxes={dirtyHighlights}
                    />
                  )}
                  <PdfPreview
                    label="Edited"
                    pageCount={applyResp.page_count}
                    pngUrlForPage={(p) => sessionPagePngUrl(applyResp.session_id, p)}
                  />
                </div>
              </motion.div>
            ) : (
              detectResp &&
              selected && (
                <motion.div
                  key="orig"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full min-h-0"
                >
                  <PdfPreview
                    label="Original"
                    pageCount={detectResp.page_count}
                    pngUrlForPage={(p) => samplePagePngUrl(selected, p)}
                    pageSizesPt={detectResp.page_sizes}
                    highlightBboxes={dirtyHighlights}
                  />
                </motion.div>
              )
            )}
          </AnimatePresence>
        </section>

        <section className="flex flex-col gap-3 min-h-0">
          {state === 'detecting' && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="size-4 animate-spin" />
              detecting editable spans…
            </div>
          )}
          {error && (
            <div className="border border-red-900 bg-red-950/30 text-red-300 rounded p-3 text-sm">
              {error}
            </div>
          )}
          {detectResp && (
            <FieldsTable
              spans={detectResp.spans}
              values={values}
              onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
            />
          )}
          {applyResp && (
            <div className="text-xs rounded border border-zinc-800 bg-zinc-900 p-3 max-h-40 overflow-auto">
              <div className="text-zinc-500 mb-1">apply result</div>
              {applyResp.results.map((r, i) => (
                <div key={i} className={cn('font-mono', r.ok ? 'text-emerald-300' : 'text-red-400')}>
                  {r.ok ? '✓' : '✗'} p{r.page + 1} {r.original_text} → {r.new_text}
                  {r.error ? ` — ${r.error}` : ''}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
