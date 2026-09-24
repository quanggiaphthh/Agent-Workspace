import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export function getErrorBoundaryMessage(_error: unknown): string {
  return 'Không thể hiển thị giao diện lúc này. Vui lòng tải lại trang.';
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.toString(), stack: error.stack, info: errorInfo.componentStack })
    }).catch(console.error);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-neutral-900/90 backdrop-blur-xs text-neutral-100 font-sans" role="alert">
          <div className="max-w-md w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="h-10 w-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-lg">
              !
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Đã xảy ra lỗi khởi chạy</h2>
              <p className="text-xs text-neutral-400 mt-1">
                {getErrorBoundaryMessage(this.state.error)}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                aria-label="Tải lại ứng dụng"
                className="w-full py-2.5 px-4 rounded-xl bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800"
              >
                Tải lại ứng dụng
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
