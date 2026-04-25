import type { ApplyResponse, DetectResponse, Sample } from './types'

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      // ignore
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json()
}

export function listSamples(): Promise<{ samples: Sample[] }> {
  return jsonFetch('/api/samples')
}

export function samplePagePngUrl(name: string, page: number, dpi = 150): string {
  return `/api/samples/${encodeURIComponent(name)}/page/${page}.png?dpi=${dpi}`
}

export function sessionPagePngUrl(sessionId: string, page: number, dpi = 150): string {
  return `/api/sessions/${sessionId}/page/${page}.png?dpi=${dpi}`
}

export function sessionPdfUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/pdf`
}

export function detect(sample: string): Promise<DetectResponse> {
  return jsonFetch('/api/detect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sample }),
  })
}

export function apply(
  sample: string,
  edits: { page: number; bbox: [number, number, number, number]; original_text: string; new_text: string }[],
): Promise<ApplyResponse> {
  return jsonFetch('/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sample, edits }),
  })
}
