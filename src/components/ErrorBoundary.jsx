import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    // Store the error for potential use in render method
    return { hasError: true, lastError: error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console and store in state
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center text-white p-8">
          <div className="max-w-2xl text-center">
            <h1 className="text-4xl font-black mb-4 text-red-500">Protocol Error</h1>
            <p className="text-zinc-400 mb-8">
              Something went wrong with the Sovereign Protocol. The system has encountered an unexpected error.
            </p>
            
            <div className="bg-zinc-900 rounded-2xl p-6 mb-8 border border-red-500/20">
              <h2 className="text-sm font-black uppercase tracking-wider mb-4 text-zinc-500">Error Details</h2>
              {this.state.error && (
                <pre className="text-xs text-red-400 font-mono overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              )}
            </div>
            
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-wider hover:bg-indigo-500 transition-all"
              >
                Reload Protocol
              </button>
              <button 
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="px-6 py-3 border border-zinc-600 text-zinc-400 rounded-2xl font-black uppercase tracking-wider hover:text-white hover:border-zinc-500 transition-all"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
