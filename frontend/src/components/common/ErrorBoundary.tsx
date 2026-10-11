import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  hasError: boolean
  message: string
  retryKey: number
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '', retryKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error.message || String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LongY Studio] renderer error', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-lg font-semibold" style={{ color: 'var(--error)' }}>工作台渲染异常</div>
        <div className="max-w-xl text-xs leading-5 text-text-secondary">{this.state.message}</div>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ hasError: false, message: '', retryKey: this.state.retryKey + 1 })}
            className="btn btn-primary">重试渲染</button>
          <button onClick={() => globalThis.location.reload()} className="btn btn-secondary">刷新窗口</button>
        </div>
      </div>
    )
  }
}
