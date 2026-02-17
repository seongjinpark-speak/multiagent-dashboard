'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly hasError: boolean
  readonly error: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950">
          <span className="text-4xl">💥</span>
          <h2 className="text-lg font-semibold text-gray-200">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-gray-500">
            {this.state.error}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
