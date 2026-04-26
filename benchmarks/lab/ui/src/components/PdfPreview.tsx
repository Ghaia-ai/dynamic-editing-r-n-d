import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Highlight = { page: number; bbox: [number, number, number, number]; color?: string }

type Props = {
  pageCount: number
  pngUrlForPage: (page: number) => string
  pageSizesPt?: [number, number][]
  highlightBboxes?: Highlight[]
  label?: string
  page: number
  onPageChange: (page: number) => void
}

export default function PdfPreview({
  pageCount,
  pngUrlForPage,
  pageSizesPt,
  highlightBboxes = [],
  label,
  page,
  onPageChange,
}: Props) {
  if (pageCount <= 0) {
    return <div className="text-[13px] text-[color:var(--ink-muted)]">No pages.</div>
  }

  const safe = Math.max(0, Math.min(pageCount - 1, page))
  const here = highlightBboxes.filter((h) => h.page === safe)
  const pagePt = pageSizesPt?.[safe]

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)]">
            {label}
          </span>
          <span className="text-[11px] text-[color:var(--ink-muted)] tabular-nums">
            page {safe + 1} / {pageCount}
          </span>
        </div>
      )}
      <div className="relative rounded-md border border-[color:var(--line)] bg-white shadow-sm overflow-hidden">
        <div className="checker">
          <div className="relative inline-block w-full">
            <img
              src={pngUrlForPage(safe)}
              className="block w-full h-auto"
              alt={`page ${safe + 1}`}
            />
            {pagePt &&
              here.map((h, i) => {
                const [x0, y0, x1, y1] = h.bbox
                const [pw, ph] = pagePt
                const color = h.color ?? 'var(--accent)'
                return (
                  <div
                    key={i}
                    className="absolute pointer-events-none rounded-[2px]"
                    style={{
                      left: `${(x0 / pw) * 100}%`,
                      top: `${(y0 / ph) * 100}%`,
                      width: `${((x1 - x0) / pw) * 100}%`,
                      height: `${((y1 - y0) / ph) * 100}%`,
                      outline: `1.5px solid ${color}`,
                      backgroundColor: 'color-mix(in srgb, currentColor 0%, transparent)',
                      boxShadow: `inset 0 0 0 9999px color-mix(in srgb, ${color} 14%, transparent)`,
                    }}
                  />
                )
              })}
          </div>
        </div>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-[12px] text-[color:var(--ink-muted)]">
          <button
            disabled={safe === 0}
            onClick={() => onPageChange(Math.max(0, safe - 1))}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-[12px]',
              safe === 0
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-[var(--line-soft)] text-[color:var(--ink-soft)]',
            )}
          >
            <ChevronLeft className="size-3" /> prev
          </button>
          <button
            disabled={safe >= pageCount - 1}
            onClick={() => onPageChange(Math.min(pageCount - 1, safe + 1))}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-[12px]',
              safe >= pageCount - 1
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-[var(--line-soft)] text-[color:var(--ink-soft)]',
            )}
          >
            next <ChevronRight className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}
