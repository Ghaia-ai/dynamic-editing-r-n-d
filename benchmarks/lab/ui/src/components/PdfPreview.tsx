import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  pageCount: number
  pngUrlForPage: (page: number) => string
  highlightBboxes?: { page: number; bbox: [number, number, number, number]; color?: string }[]
  pageSizesPt?: [number, number][]
  label?: string
}

export default function PdfPreview({
  pageCount,
  pngUrlForPage,
  highlightBboxes = [],
  pageSizesPt,
  label,
}: Props) {
  const [page, setPage] = useState(0)

  if (pageCount <= 0) {
    return <div className="text-sm text-zinc-500">No pages.</div>
  }

  const pageHighlights = highlightBboxes.filter((h) => h.page === page)
  const pagePt = pageSizesPt?.[page]

  return (
    <div className="flex flex-col gap-2 h-full">
      {label && <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>}
      <div className="relative flex-1 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900 overflow-auto">
        <div className="relative inline-block">
          <img
            src={pngUrlForPage(page)}
            className="block max-w-full h-auto"
            alt={`page ${page + 1}`}
          />
          {pagePt &&
            pageHighlights.map((h, i) => {
              const [x0, y0, x1, y1] = h.bbox
              const [pw, ph] = pagePt
              return (
                <div
                  key={i}
                  className="absolute pointer-events-none border-2 border-amber-400/80 bg-amber-400/10 rounded-sm"
                  style={{
                    left: `${(x0 / pw) * 100}%`,
                    top: `${(y0 / ph) * 100}%`,
                    width: `${((x1 - x0) / pw) * 100}%`,
                    height: `${((y1 - y0) / ph) * 100}%`,
                    borderColor: h.color ?? undefined,
                  }}
                />
              )
            })}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded border border-zinc-800',
            page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800',
          )}
        >
          <ChevronLeft className="size-3" /> prev
        </button>
        <span>
          page {page + 1} / {pageCount}
        </span>
        <button
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded border border-zinc-800',
            page >= pageCount - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800',
          )}
        >
          next <ChevronRight className="size-3" />
        </button>
      </div>
    </div>
  )
}
