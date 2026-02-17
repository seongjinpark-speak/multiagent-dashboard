'use client'

export function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950">
      <div className="flex items-center gap-2">
        <span className="animate-pulse text-2xl">🏘️</span>
        <span className="text-lg text-gray-400">Connecting to MAMH...</span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-blue-500"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
