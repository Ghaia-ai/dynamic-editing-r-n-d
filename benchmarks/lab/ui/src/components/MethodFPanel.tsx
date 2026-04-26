import { useEffect, useRef, useState } from 'react'
import type { MethodRunResponse } from '@/lib/types'
import { ExternalLink, AlertTriangle } from 'lucide-react'

declare global {
  interface Window {
    WebViewer?: (
      options: {
        path: string
        initialDoc: string
        licenseKey?: string
        fullAPI?: boolean
      },
      element: HTMLElement,
    ) => Promise<unknown>
  }
}

type Props = { run: MethodRunResponse }

const APRYSE_CDN = 'https://cdn.jsdelivr.net/npm/@pdftron/webviewer@10.12.0/public/webviewer.min.js'

export default function MethodFPanel({ run }: Props) {
  const r = (run.method_result ?? {}) as { pdf_url?: string; demo?: boolean }
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!r.pdf_url) return
    let cancelled = false

    const ensureScript = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (window.WebViewer) return resolve()
        const existing = document.querySelector<HTMLScriptElement>(
          `script[src="${APRYSE_CDN}"]`,
        )
        if (existing) {
          existing.addEventListener('load', () => resolve())
          existing.addEventListener('error', () => reject(new Error('failed to load Apryse SDK')))
          return
        }
        const s = document.createElement('script')
        s.src = APRYSE_CDN
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('failed to load Apryse SDK from CDN'))
        document.head.appendChild(s)
      })

    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.WebViewer) return
        // clear any prior viewer
        containerRef.current.innerHTML = ''
        return window.WebViewer(
          {
            path: 'https://cdn.jsdelivr.net/npm/@pdftron/webviewer@10.12.0/public',
            initialDoc: window.location.origin + r.pdf_url!,
            fullAPI: false,
          },
          containerRef.current,
        ).then(() => {
          if (!cancelled) setReady(true)
        })
      })
      .catch((e) => {
        if (!cancelled) setScriptError(String(e))
      })

    return () => {
      cancelled = true
    }
  }, [r.pdf_url])

  return (
    <div className="space-y-4">
      <header className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[18px] font-semibold tracking-tight">Apryse WebViewer</h2>
        <span className="text-[12px] text-[color:var(--ink-muted)]">
          Commercial baseline — same primitive as Approach C, productized.
        </span>
      </header>

      {scriptError && (
        <div className="rounded-md border border-[color:var(--bad-soft)] bg-[var(--bad-soft)] text-[color:var(--bad)] px-4 py-3 flex gap-3 items-start">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div className="text-[13px] leading-relaxed">
            <div className="font-medium">Couldn't load the WebViewer SDK</div>
            <div className="text-[color:var(--ink-soft)] mt-0.5">
              {scriptError}. Apryse loads from a CDN; check the browser network tab for blocked requests.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-[color:var(--line)] bg-[var(--surface)] overflow-hidden">
        <div
          ref={containerRef}
          className="w-full h-[680px] bg-[var(--canvas)]"
        >
          {!ready && !scriptError && (
            <div className="h-full flex items-center justify-center text-[13px] text-[color:var(--ink-muted)]">
              Loading WebViewer from CDN…
            </div>
          )}
        </div>
      </div>

      <div className="text-[12px] text-[color:var(--ink-muted)] flex items-center gap-1.5">
        <ExternalLink className="size-3" />
        WebViewer 10.12 demo build · output is watermarked unless APRYSE_LICENSE_KEY is configured.
      </div>

      {run.notes.length > 0 && (
        <ul className="text-[12px] text-[color:var(--ink-muted)] space-y-1 border-t border-[color:var(--line)] pt-3">
          {run.notes.map((n, i) => (
            <li key={i}>— {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
