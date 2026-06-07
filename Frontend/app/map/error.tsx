'use client'

export default function MapError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-2xl font-bold text-red-400">Page failed to load</h1>
        <p className="text-slate-400 text-sm">{error.message || 'Internal server error'}</p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 rounded-full bg-orange-500 hover:bg-orange-600 font-medium transition"
          >
            Try again
          </button>
          <p className="text-xs text-slate-500">
            If it persists, stop the dev server and run: rm -rf .next && npm run dev
          </p>
        </div>
      </div>
    </div>
  )
}
