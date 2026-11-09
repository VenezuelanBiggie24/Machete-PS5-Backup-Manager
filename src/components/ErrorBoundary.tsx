import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught exception:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-6 bg-slate-950 border border-red-500/50 rounded-2xl text-red-200 font-mono text-xs shadow-2xl flex flex-col gap-4 m-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {this.props.fallbackTitle || 'Execution Error'}
            </h3>
          </div>
          <div className="p-3 bg-black/60 rounded-lg border border-red-500/20 text-red-300 overflow-x-auto text-[11px]">
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={this.handleReset}
            className="self-start px-4 py-2 bg-red-950/60 hover:bg-red-900 border border-red-500/40 rounded-xl text-white font-mono text-xs flex items-center gap-2 transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
