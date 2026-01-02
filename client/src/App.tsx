import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Loader2 } from "lucide-react";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";

// Lazy load pages for performance optimization
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadPage = lazy(() => import("./pages/Upload"));
const AuditResults = lazy(() => import("./pages/AuditResults"));
const HoldQueue = lazy(() => import("./pages/HoldQueue"));
const SpecManagement = lazy(() => import("./pages/SpecManagement"));
const SearchPage = lazy(() => import("./pages/Search"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ExecutiveDashboard = lazy(() => import("./pages/analytics/ExecutiveDashboard"));
const DefectAnalysis = lazy(() => import("./pages/analytics/DefectAnalysis"));
const TechnicianPerformance = lazy(() => import("./pages/analytics/TechnicianPerformance"));
const FirstFixAnalysis = lazy(() => import("./pages/analytics/FirstFixAnalysis"));
const AIAnalyst = lazy(() => import("./pages/analytics/AIAnalyst"));
const ReportStudio = lazy(() => import("./pages/analytics/ReportStudio"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const TechnicianDashboard = lazy(() => import("./pages/portal/TechnicianDashboard"));
const DisputeManagement = lazy(() => import("./pages/DisputeManagement"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Settings = lazy(() => import("./pages/Settings"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const DemoGateway = lazy(() => import("./pages/DemoGateway"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm animate-pulse">Loading application...</p>
    </div>
  </div>
);

function Router() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user && location !== "/demo" && !location.startsWith("/portal/login")) {
      setLocation("/demo");
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/demo" component={DemoGateway} />
        <Route path={"/"} component={Dashboard} />
        <Route path={"/upload"} component={UploadPage} />
        <Route path={"/audits"} component={AuditResults} />
        <Route path={"/hold-queue"} component={HoldQueue} />
        <Route path={"/specs"} component={SpecManagement} />
        <Route path={"/search"} component={SearchPage} />
        <Route path={"/users"} component={UserManagement} />
        <Route path={"/analytics"} component={ExecutiveDashboard} />
        <Route path={"/analytics/defects"} component={DefectAnalysis} />
        <Route path={"/analytics/technicians"} component={TechnicianPerformance} />
        <Route path={"/analytics/first-fix"} component={FirstFixAnalysis} />

        <Route path={"/analytics/ai"} component={AIAnalyst} />
        <Route path={"/analytics/reports"} component={ReportStudio} />
        <Route path={"/portal/login"} component={PortalLogin} />
        <Route path={"/portal/dashboard"} component={TechnicianDashboard} />
        <Route path="/disputes">
          <ProtectedRoute component={DisputeManagement} allowedRoles={['admin', 'qa_lead']} />
        </Route>
        <Route path="/audit-log">
          <ProtectedRoute component={AuditLog} allowedRoles={['admin']} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={Settings} allowedRoles={['admin', 'qa_lead']} />
        </Route>
        <Route path="/help" component={HelpCenter} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster />
              <Router />
              <OnboardingTour />
            </TooltipProvider>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
