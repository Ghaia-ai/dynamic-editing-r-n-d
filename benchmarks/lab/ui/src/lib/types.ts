export type Sample = {
  name: string
  size_bytes: number
  page_count: number
}

export type Span = {
  id: string
  page: number
  bbox: [number, number, number, number]
  text: string
  font: string
  fontsize: number
  color: [number, number, number]
  is_arabic: boolean
  editable: boolean
  kind: 'numeric' | 'percent' | 'arabic-text' | 'other'
}

export type DetectResponse = {
  sample: string
  page_count: number
  page_sizes: [number, number][]
  spans: Span[]
}

export type ApplyResult = {
  page: number
  original_text: string
  new_text: string
  ok: boolean
  replacements: number
  error: string | null
  trace: Record<string, unknown> | null
}

export type ApplyResponse = {
  session_id: string
  page_count: number
  results: ApplyResult[]
}
