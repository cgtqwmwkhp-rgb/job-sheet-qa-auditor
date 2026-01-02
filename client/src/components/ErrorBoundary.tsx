import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Component, ReactNode, ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Log error details for debugging
    this.logError(error, errorInfo);
  }

  private logError(error: Error, errorInfo: ErrorInfo) {
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };
    console.log('Error report:', JSON.stringify(errorReport, null, 2));
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-6 text-center">
              We're sorry, but something unexpected happened. Please try again.
            </p>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 max-h-48">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.message}
              </pre>
              {this.state.error?.stack && (
                <pre className="text-xs text-muted-foreground/70 mt-2 whitespace-break-spaces">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={this.handleRetry} variant="default">
                <RotateCcw size={16} className="mr-2" />
                Try Again
              </Button>
              <Button onClick={this.handleGoHome} variant="outline">
                <Home size={16} className="mr-2" />
                Go Home
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground mt-6">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
