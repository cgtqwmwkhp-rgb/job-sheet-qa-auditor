import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ServerCrash, Home, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

/**
 * 500 Server Error Page
 * =====================
 * Displayed when a server error occurs
 */
export default function ServerError() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-100 rounded-full animate-pulse" />
              <ServerCrash className="relative h-16 w-16 text-orange-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 mb-2">500</h1>

          <h2 className="text-xl font-semibold text-slate-700 mb-4">
            Server Error
          </h2>

          <p className="text-slate-600 mb-8 leading-relaxed">
            Something went wrong on our end.
            <br />
            Our team has been notified and is working on a fix.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="px-6 py-2.5 rounded-lg transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button
              onClick={handleGoHome}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground mt-6">
            If this problem persists, please contact support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
