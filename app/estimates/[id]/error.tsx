'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function EstimateBuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[EstimateBuilder Error]', error.message, error.stack)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg w-full">
        <h2 className="text-red-700 font-semibold text-lg mb-2">
          Estimate Builder Failed to Load
        </h2>
        <p className="text-red-600 text-sm mb-1">
          <strong>Error:</strong> {error.message}
        </p>
        {error.digest && (
          <p className="text-red-400 text-xs mb-4">Digest: {error.digest}</p>
        )}
        <div className="flex gap-3 mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/estimates')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
          >
            Back to Estimates
          </button>
        </div>
      </div>
    </div>
  )
}