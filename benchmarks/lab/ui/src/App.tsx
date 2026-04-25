import { useEffect, useState } from 'react'

type Health = {
  status: string
  samples_dir_exists: boolean
  samples_count: number
  ui_dist_exists: boolean
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-10">
      <h1 className="text-3xl font-semibold tracking-tight">Dynamic PDF Editing Lab</h1>
      <p className="text-zinc-400 mt-2 text-sm">phase-3 boot check. real UI lands in the next commit.</p>
      <pre className="mt-8 text-xs bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-auto">
        {error ? `error: ${error}` : JSON.stringify(health, null, 2)}
      </pre>
    </main>
  )
}
