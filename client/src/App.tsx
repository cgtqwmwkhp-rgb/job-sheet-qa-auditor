import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Loader2 } from "lucide-react";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useAuth } from "@/contexts/AuthContext";
import { useProcessingWatchdog } from "@/hooks/useProcessingWatch";

function ProcessingWatchdog() {
  useProcessingWatchdog();
  return null;
}

// Lazy load pages for performance optimization
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadPage = lazy(() => import("./pages/Upload"));
const AuditResults = lazy(() => import("./pages/AuditResults"));
const HoldQueue = lazy(() => import("./pages/HoldQueue"));
const SpecManagement = lazy(() => import("./pages/SpecManagement"));
const SearchPage = lazy(() => import("./pages/Search"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ExecutiveDashboard = lazy(
  () => import("./pages/analytics/ExecutiveDashboard")
);
const DefectAnalysis = lazy(() => import("./pages/analytics/DefectAnalysis"));
const TechnicianPerformance = lazy(
  () => import("./pages/analytics/TechnicianPerformance")
);
const FirstFixAnalysis = lazy(
  () => import("./pages/analytics/FirstFixAnalysis")
);
const AIAnalyst = lazy(() => import("./pages/analytics/AIAnalyst"));
const ReportStudio = lazy(() => import("./pages/analytics/ReportStudio"));
const SiteIntelligence = lazy(
  () => import("./pages/analytics/SiteIntelligence")
);
const DriftDetection = lazy(() => import("./pages/analytics/DriftDetection"));
const PredictiveRisk = lazy(() => import("./pages/analytics/PredictiveRisk"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const DemoGateway = lazy(() => import("./pages/DemoGateway"));
const TechnicianDashboard = lazy(
  () => import("./pages/portal/TechnicianDashboard")
);
const DisputeManagement = lazy(() => import("./pages/DisputeManagement"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Settings = lazy(() => import("./pages/Settings"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading fallback — no app chrome (Phase 0 portal cleanliness)
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#ececec]">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  </div>
);

/** Staff routes require auth; unauthenticated users see Entra screen only. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function Router() {
  const { isLoading, user } = useAuth();

  if (isLoading) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login">{user ? <Redirect to="/" /> : <Login />}</Route>
        <Route path="/portal/login">
          {user ? <Redirect to="/portal/dashboard" /> : <PortalLogin />}
        </Route>
        {/* /demo retained for Playwright E2E helpers — not linked in product nav */}
        <Route path="/demo" component={DemoGateway} />

        <Route path="/">
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        </Route>
        <Route path="/upload">
          <RequireAuth>
            <UploadPage />
          </RequireAuth>
        </Route>
        <Route path="/audits">
          <RequireAuth>
            <AuditResults />
          </RequireAuth>
        </Route>
        <Route path="/hold-queue">
          <RequireAuth>
            <HoldQueue />
          </RequireAuth>
        </Route>
        <Route path="/specs">
          <RequireAuth>
            <SpecManagement />
          </RequireAuth>
        </Route>
        <Route path="/search">
          <RequireAuth>
            <SearchPage />
          </RequireAuth>
        </Route>
        <Route path="/users">
          <RequireAuth>
            <UserManagement />
          </RequireAuth>
        </Route>
        <Route path="/analytics">
          <RequireAuth>
            <ExecutiveDashboard />
          </RequireAuth>
        </Route>
        <Route path="/analytics/defects">
          <RequireAuth>
            <DefectAnalysis />
          </RequireAuth>
        </Route>
        <Route path="/analytics/technicians">
          <RequireAuth>
            <TechnicianPerformance />
          </RequireAuth>
        </Route>
        <Route path="/analytics/sites">
          <RequireAuth>
            <SiteIntelligence />
          </RequireAuth>
        </Route>
        <Route path="/analytics/drift">
          <RequireAuth>
            <DriftDetection />
          </RequireAuth>
        </Route>
        <Route path="/analytics/predictive">
          <RequireAuth>
            <PredictiveRisk />
          </RequireAuth>
        </Route>
        {/* Coming Soon pages kept routable but out of nav */}
        <Route path="/analytics/first-fix">
          <RequireAuth>
            <FirstFixAnalysis />
          </RequireAuth>
        </Route>
        <Route path="/analytics/ai">
          <RequireAuth>
            <AIAnalyst />
          </RequireAuth>
        </Route>
        <Route path="/analytics/reports">
          <RequireAuth>
            <ReportStudio />
          </RequireAuth>
        </Route>
        <Route path="/portal/dashboard">
          <RequireAuth>
            <TechnicianDashboard />
          </RequireAuth>
        </Route>
        <Route path="/disputes">
          <ProtectedRoute
            component={DisputeManagement}
            allowedRoles={["admin", "qa_lead"]}
          />
        </Route>
        <Route path="/audit-log">
          <ProtectedRoute component={AuditLog} allowedRoles={["admin"]} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute
            component={Settings}
            allowedRoles={["admin", "qa_lead"]}
          />
        </Route>
        {/* Help stays public (E2E + support links) */}
        <Route path="/help" component={HelpCenter} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Theme: switchable ThemeProvider + header ThemeToggle; tokens in index.css (brand-lime).

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster />
              <ProcessingWatchdog />
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
