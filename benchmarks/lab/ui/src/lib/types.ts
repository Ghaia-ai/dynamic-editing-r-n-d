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

export type MethodId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export type MethodDef = {
  id: MethodId
  name: string
  tagline: string
  implementation: 'live' | 'stub'
  what_runs: string
  what_lab_shows: string
  limits: string
  verdict: string
}

export type MethodRunResponse = {
  method_id: MethodId
  name: string
  implementation: 'live' | 'stub'
  sample: string
  page_count: number
  page_sizes: [number, number][]
  // A, C return these
  detect: DetectResponse | null
  apply: ApplyResponse | null
  // B, D, E, F return this (shape varies per method)
  method_result: Record<string, unknown> | null
  notes: string[]
  evidence: {
    tagline: string
    what_runs: string
    what_lab_shows: string
    limits: string
    verdict: string
  } | null
}
