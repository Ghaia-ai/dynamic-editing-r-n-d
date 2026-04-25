import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, Download, RotateCw, Loader2, Info, AlertCircle } from 'lucide-react'
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
import ChangesPanel from './ChangesPanel'

type RunState = 'idle' | 'detecting' | 'ready' | 'applying' | 'done' | 'error'

export default function Lab() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detectResp, setDetectResp] = useState<DetectResponse | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [applyResp, setApplyResp] = useState<ApplyResponse | null>(null)
  const [state, setState] = useState<RunState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [previewPage, setPreviewPage] = useState(0)

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
    setPreviewPage(0)
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

  // True when user typed new edits after the last successful generate.
  const editedIsStale = applyResp !== null && dirtyEdits.length > 0

  const onApply = async () => {
    if (!selected || dirtyEdits.length === 0) return
    setState('applying')
    setError(null)
    try {
      const r = await apply(selected, dirtyEdits)
      setApplyResp(r)
      // jump preview to the first changed page
      if (dirtyEdits[0]) setPreviewPage(dirtyEdits[0].page)
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
    setPreviewPage(0)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold tracking-tight">Dynamic PDF Editing Lab</h1>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                Method: Overlay (Approach C)
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed max-w-3xl">
              Testing whether arbitrary uploaded posters can be edited surgically: detect numeric values, cover them with a colour-matched rectangle, and draw the new value at the same bbox in the same font. Other approaches (B: HTML roundtrip, D: layout-AI) live in the report — only Approach&nbsp;C is wired into the lab.
            </p>
            <ol className="flex items-center gap-2 text-xs mt-3">
              <Step n={1} label="Pick a sample" active={selected !== null} />
              <Step n={2} label={`Type new values (${dirtyEdits.length} pending)`} active={dirtyEdits.length > 0} />
              <Step n={3} label="Generate & compare" active={applyResp !== null} />
            </ol>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
                <Download className="size-4" /> edited PDF
              </a>
            )}
          </div>
        </div>
        <div className="px-6 pb-3">
          <SamplePicker samples={samples} selected={selected} onSelect={setSelected} />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 p-4 min-h-0">
        <section className="flex flex-col gap-3 min-h-0">
          <AnimatePresence mode="wait">
            {applyResp && detectResp && selected ? (
              <motion.div
                key="comparing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3 min-h-0"
              >
                <div className="grid grid-cols-2 gap-4">
                  <PdfPreview
                    label="Original"
                    pageCount={detectResp.page_count}
                    pngUrlForPage={(p) => samplePagePngUrl(selected, p)}
                    pageSizesPt={detectResp.page_sizes}
                    highlightBboxes={dirtyHighlights}
                    initialPage={previewPage}
                  />
                  <div className="relative">
                    <PdfPreview
                      label="Edited"
                      pageCount={applyResp.page_count}
                      pngUrlForPage={(p) => sessionPagePngUrl(applyResp.session_id, p)}
                      initialPage={previewPage}
                    />
                    {editedIsStale && (
                      <div className="absolute inset-0 bg-zinc-950/70 rounded-lg flex items-center justify-center pointer-events-none">
                        <div className="text-amber-300 text-xs flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-950/90 border border-amber-500/40">
                          <AlertCircle className="size-3" />
                          stale — click generate to apply your new edits
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <ChangesPanel
                  sample={selected}
                  sessionId={applyResp.session_id}
                  results={applyResp.results}
                />
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
                  {dirtyEdits.length === 0 && (
                    <div className="mb-3 flex items-start gap-2 text-xs text-zinc-400 rounded-md border border-zinc-800 bg-zinc-900 p-3">
                      <Info className="size-4 shrink-0 mt-0.5 text-zinc-500" />
                      <div>
                        <span className="text-zinc-200">Type a number into the table on the right.</span>{' '}
                        Edited fields will get an amber tint and a highlight here on the preview, then click{' '}
                        <span className="text-amber-300">generate</span> to overlay them onto the PDF.
                      </div>
                    </div>
                  )}
                  <PdfPreview
                    label="Original"
                    pageCount={detectResp.page_count}
                    pngUrlForPage={(p) => samplePagePngUrl(selected, p)}
                    pageSizesPt={detectResp.page_sizes}
                    highlightBboxes={dirtyHighlights}
                    initialPage={previewPage}
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
        </section>
      </main>
    </div>
  )
}

function Step({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full border',
        active
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-zinc-800 bg-zinc-900 text-zinc-500',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center size-4 rounded-full text-[10px] font-mono',
          active ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400',
        )}
      >
        {n}
      </span>
      <span>{label}</span>
    </li>
  )
}
