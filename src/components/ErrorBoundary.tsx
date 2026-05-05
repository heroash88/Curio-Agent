import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="mb-6 rounded-full bg-rose-100 p-4 text-rose-600">
            <AlertCircle size={48} />
          </div>
          <h1 className="mb-3 text-2xl font-bold text-slate-800">Oops, Curio encountered a snag!</h1>
          <p className="mb-8 max-w-md text-slate-600">
            {this.state.error?.message || 'Something went wrong while loading the robot interface.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-2xl bg-sky-500 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-sky-600 active:scale-95"
          >
            <RefreshCw size={20} />
            Refresh App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
