'use client'

interface ConnectionBadgeProps {
  readonly isConnected: boolean
}

export function ConnectionBadge({ isConnected }: ConnectionBadgeProps) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
      isConnected
        ? 'bg-green-500/10 text-green-400'
        : 'bg-red-500/10 text-red-400'
    }`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${
        isConnected ? 'bg-green-400' : 'bg-red-400'
      }`} />
      {isConnected ? 'Online' : 'Offline'}
    </span>
  )
}
