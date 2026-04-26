import { useEffect, useMemo, useState } from 'react'
import { Loader2, Wand2, Download, RotateCw } from 'lucide-react'
import {
  listMethods,
  listSamples,
  runMethod,
  samplePagePngUrl,
  sessionPagePngUrl,
  sessionPdfUrl,
} from '@/lib/api'
import type {
  ApplyResponse,
  DetectResponse,
  MethodDef,
  MethodId,
  MethodRunResponse,
  Sample,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import SamplePicker from './SamplePicker'
import MethodTabs from './MethodTabs'
import PdfPreview from './PdfPreview'
import FieldsTable from './FieldsTable'
import ChangesPanel from './ChangesPanel'
import StubMethodPanel from './StubMethodPanel'
import MethodBPanel from './MethodBPanel'
import MethodDPanel from './MethodDPanel'
import MethodEPanel from './MethodEPanel'
import MethodFPanel from './MethodFPanel'

type RunState = 'idle' | 'loading' | 'ready' | 'applying' | 'error'

export default function Lab() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [methods, setMethods] = useState<MethodDef[]>([])
  const [sample, setSample] = useState<string | null>(null)
  const [method, setMethod] = useState<MethodId>('C')
  const [run, setRun] = useState<MethodRunResponse | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [state, setState] = useState<RunState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  // initial load
  useEffect(() => {
    Promise.all([listSamples(), listMethods()])
      .then(([s, m]) => {
        setSamples(s.samples)
        setMethods(m.methods)
        if (s.samples.length > 0) setSample(s.samples[0].name)
      })
      .catch((e) => setError(String(e)))
  }, [])

  // run on (sample, method) change
  useEffect(() => {
    if (!sample) return
    setState('loading')
    setError(null)
    setValues({})
    setRun(null)
    setPage(0)
    runMethod(method, sample)
      .then((r) => {
        setRun(r)
        setState('ready')
      })
      .catch((e) => {
        setError(String(e))
        setState('error')
      })
  }, [sample, method])

  const detect: DetectResponse | null = run?.detect ?? null
  const apply: ApplyResponse | null = run?.apply ?? null

  const dirtyEdits = useMemo(() => {
    if (!detect) return []
    return detect.spans
      .filter((s) => s.editable)
      .map((s) => {
        const v = values[s.id]
        if (v === undefined || v === '' || v === s.text) return null
        return { page: s.page, bbox: s.bbox, original_text: s.text, new_text: v }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [detect, values])

  const dirtyHighlights = useMemo(() => {
    if (!detect) return []
    return detect.spans
      .filter((s) => {
        const v = values[s.id]
        return v !== undefined && v !== '' && v !== s.text
      })
      .map((s) => ({ page: s.page, bbox: s.bbox }))
  }, [detect, values])

  // For Approach A (detect-only), highlight every detected span lightly so
  // users see what the detector finds.
  const detectHighlights = useMemo(() => {
    if (!detect || method !== 'A') return []
    return detect.spans.map((s) => ({
      page: s.page,
      bbox: s.bbox,
      color: s.editable ? 'var(--accent)' : 'var(--ink-muted)',
    }))
  }, [detect, method])

  const onGenerate = async () => {
    if (!sample || dirtyEdits.length === 0) return
    setState('applying')
    setError(null)
    try {
      const r = await runMethod(method, sample, dirtyEdits)
      setRun(r)
      if (dirtyEdits[0]) setPage(dirtyEdits[0].page)
      setState('ready')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }

  const onReset = () => {
    setValues({})
    if (run?.apply) {
      // strip the apply but keep detect
      setRun({ ...run, apply: null })
    }
    setPage(0)
  }

  const editedIsStale = apply !== null && dirtyEdits.length > 0
  const activeMethod = methods.find((m) => m.id === method)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* control row: sample picker + method tabs + run button */}
      <div className="bg-[var(--surface)] border-b border-[color:var(--line)]">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <SamplePicker samples={samples} selected={sample} onSelect={setSample} />
          <div className="flex items-center gap-2">
            {method === 'C' && (
              <>
                <button
                  onClick={onReset}
                  disabled={state === 'loading' || state === 'applying'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] text-[color:var(--ink-soft)] hover:bg-[var(--line-soft)] disabled:opacity-40"
                >
                  <RotateCw className="size-3.5" />
                  Reset
                </button>
                <button
                  onClick={onGenerate}
                  disabled={dirtyEdits.length === 0 || state === 'applying'}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                    dirtyEdits.length === 0
                      ? 'bg-[var(--line-soft)] text-[color:var(--ink-muted)] cursor-not-allowed'
                      : 'bg-[var(--accent)] text-white hover:opacity-90',
                  )}
                >
                  {state === 'applying' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5" />
                  )}
                  Generate
                  {dirtyEdits.length > 0 && (
                    <span className="text-[11px] opacity-80">({dirtyEdits.length})</span>
                  )}
                </button>
                {apply && (
                  <a
                    href={sessionPdfUrl(apply.session_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] text-[color:var(--ink-soft)] hover:bg-[var(--line-soft)]"
                  >
                    <Download className="size-3.5" />
                    Download PDF
                  </a>
                )}
              </>
            )}
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto px-8 pb-4">
          <MethodTabs
            methods={methods}
            current={method}
            onSelect={setMethod}
          />
        </div>
      </div>

      {/* method body */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-6">
          {error && (
            <div className="mb-4 rounded-md border border-[color:var(--bad-soft)] bg-[var(--bad-soft)] text-[color:var(--bad)] text-[13px] px-4 py-2.5">
              {error}
            </div>
          )}

          {state === 'loading' && (
            <div className="flex items-center gap-2 text-[color:var(--ink-muted)] text-[13px]">
              <Loader2 className="size-4 animate-spin" />
              Loading method…
            </div>
          )}

          {run && activeMethod && run.implementation === 'stub' && (
            <StubMethodPanel method={activeMethod} run={run} />
          )}

          {run && method === 'B' && <MethodBPanel run={run} />}
          {run && method === 'D' && <MethodDPanel run={run} />}
          {run && method === 'E' && <MethodEPanel run={run} />}
          {run && method === 'F' && <MethodFPanel run={run} />}

          {run && run.implementation === 'live' && (method === 'A' || method === 'C') && detect && sample && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">
              {/* left: previews */}
              <section className="space-y-3 min-w-0">
                {method === 'C' && apply ? (
                  <div className="grid grid-cols-2 gap-4">
                    <PdfPreview
                      label="Original"
                      pageCount={detect.page_count}
                      pageSizesPt={detect.page_sizes}
                      pngUrlForPage={(p) => samplePagePngUrl(sample, p)}
                      highlightBboxes={dirtyHighlights}
                      page={page}
                      onPageChange={setPage}
                    />
                    <div className="relative">
                      <PdfPreview
                        label="Edited"
                        pageCount={apply.page_count}
                        pageSizesPt={detect.page_sizes}
                        pngUrlForPage={(p) => sessionPagePngUrl(apply.session_id, p)}
                        page={page}
                        onPageChange={setPage}
                      />
                      {editedIsStale && (
                        <div className="absolute inset-0 flex items-end justify-center pb-12 pointer-events-none">
                          <div className="bg-[var(--surface)] border border-[color:var(--line)] shadow-sm rounded-md px-3 py-1.5 text-[12px] text-[color:var(--warn)]">
                            Stale — click Generate to apply your new edits
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <PdfPreview
                    label={method === 'A' ? 'Original — every detected span' : 'Original'}
                    pageCount={detect.page_count}
                    pageSizesPt={detect.page_sizes}
                    pngUrlForPage={(p) => samplePagePngUrl(sample, p)}
                    highlightBboxes={method === 'A' ? detectHighlights : dirtyHighlights}
                    page={page}
                    onPageChange={setPage}
                  />
                )}

                {method === 'C' && apply && (
                  <ChangesPanel
                    sample={sample}
                    sessionId={apply.session_id}
                    results={apply.results}
                  />
                )}
              </section>

              {/* right: data panel */}
              <aside className="min-w-0">
                <FieldsTable
                  spans={detect.spans}
                  values={values}
                  onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
                  readonly={method === 'A'}
                  notes={run.notes}
                />
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
