'use client'

interface TaskSummaryProps {
  readonly working: number
  readonly idle: number
  readonly completed: number
}

export function TaskSummary({ working, idle, completed }: TaskSummaryProps) {
  const items = [
    { label: 'Working', value: working, color: 'text-yellow-400' },
    { label: 'Idle', value: idle, color: 'text-gray-400' },
    { label: 'Completed', value: completed, color: 'text-green-400' },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(item => (
        <div key={item.label} className="text-center">
          <div className={`text-2xl font-bold ${item.color}`}>
            {item.value}
          </div>
          <div className="text-xs text-gray-500">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
