import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
// QueryClient is now only in main.tsx - removed duplicate provider
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import { ErrorBoundary, RouteErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  AuthProvider,
  isDemoAuthAllowed,
  useAuth,
  type UserRole,
} from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Loader2 } from "lucide-react";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useProcessingWatchdog } from "@/hooks/useProcessingWatch";
import { initializeErrorTracking } from "@/lib/errorTracking";
import { lazyRetry } from "@/lib/lazyRetry";

const STAFF_ROLES: UserRole[] = ["admin", "qa_lead", "viewer"];
const TECH_ROLES: UserRole[] = ["technician"];

function ProcessingWatchdog() {
  useProcessingWatchdog();
  return null;
}

// Lazy load pages — retry + one-shot reload on stale post-deploy chunks
const Login = lazyRetry(() => import("./pages/Login"));
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const UploadPage = lazyRetry(() => import("./pages/Upload"));
const AuditResults = lazyRetry(() => import("./pages/AuditResults"));
const HoldQueue = lazyRetry(() => import("./pages/HoldQueue"));
const TemplateStudio = lazyRetry(() => import("./pages/TemplateStudio"));
const SearchPage = lazyRetry(() => import("./pages/Search"));
const UserManagement = lazyRetry(() => import("./pages/UserManagement"));
const ExecutiveDashboard = lazyRetry(
  () => import("./pages/analytics/ExecutiveDashboard")
);
const DefectAnalysis = lazyRetry(
  () => import("./pages/analytics/DefectAnalysis")
);
const TechnicianPerformance = lazyRetry(
  () => import("./pages/analytics/TechnicianPerformance")
);
const EngineerCoachingPack = lazyRetry(
  () => import("./pages/analytics/EngineerCoachingPack")
);
const SiteIntelligence = lazyRetry(
  () => import("./pages/analytics/SiteIntelligence")
);
const DriftDetection = lazyRetry(
  () => import("./pages/analytics/DriftDetection")
);
const PredictiveRisk = lazyRetry(
  () => import("./pages/analytics/PredictiveRisk")
);
const PortalLogin = lazyRetry(() => import("./pages/portal/PortalLogin"));
const DemoGateway = lazyRetry(() => import("./pages/DemoGateway"));
const TechnicianDashboard = lazyRetry(
  () => import("./pages/portal/TechnicianDashboard")
);
const DisputeManagement = lazyRetry(() => import("./pages/DisputeManagement"));
const AuditLog = lazyRetry(() => import("./pages/AuditLog"));
const Settings = lazyRetry(() => import("./pages/Settings"));
const HelpCenter = lazyRetry(() => import("./pages/HelpCenter"));
const Monitoring = lazyRetry(() => import("./pages/Monitoring"));
const FeatureFlagMatrix = lazyRetry(() => import("./pages/FeatureFlagMatrix"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));

// Loading fallback — no app chrome (Phase 0 portal cleanliness)
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-muted">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  </div>
);

/** Authenticated staff (admin / qa_lead / viewer). Technicians → portal. */
function RequireStaff({ children }: { children: React.ReactNode }) {
  const { user, isLoading, hasRole } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (hasRole(TECH_ROLES)) return <Redirect to="/portal/dashboard" />;
  if (!hasRole(STAFF_ROLES)) return <Redirect to="/login" />;
  return <>{children}</>;
}

function Router() {
  const { isLoading, user } = useAuth();

  // Initialize error tracking on mount
  useEffect(() => {
    initializeErrorTracking({
      user: user
        ? {
            id: Number(user.id),
            email: user.email,
            role: user.role,
          }
        : undefined,
    });
  }, [user]);

  if (isLoading) return <PageLoader />;

  const homeRedirect = user?.role === "technician" ? "/portal/dashboard" : "/";

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login">
          {user ? <Redirect to={homeRedirect} /> : <Login />}
        </Route>
        <Route path="/portal/login">
          {user ? <Redirect to={homeRedirect} /> : <PortalLogin />}
        </Route>
        {/* /demo — Playwright / local DEV only; not linked in product nav */}
        <Route path="/demo">
          {isDemoAuthAllowed() ? <DemoGateway /> : <Redirect to="/login" />}
        </Route>

        <Route path="/">
          <RequireStaff>
            <RouteErrorBoundary routeName="Dashboard">
              <Dashboard />
            </RouteErrorBoundary>
          </RequireStaff>
        </Route>
        <Route path="/upload">
          <RequireStaff>
            <RouteErrorBoundary routeName="Upload">
              <UploadPage />
            </RouteErrorBoundary>
          </RequireStaff>
        </Route>
        <Route path="/audits">
          <RequireStaff>
            <RouteErrorBoundary routeName="AuditResults">
              <AuditResults />
            </RouteErrorBoundary>
          </RequireStaff>
        </Route>
        <Route path="/hold-queue">
          <RequireStaff>
            <RouteErrorBoundary routeName="Hold Queue">
              <HoldQueue />
            </RouteErrorBoundary>
          </RequireStaff>
        </Route>
        <Route path="/specs">
          <Redirect to="/template-studio" />
        </Route>
        <Route path="/template-studio">
          <ProtectedRoute
            component={TemplateStudio}
            allowedRoles={["admin", "qa_lead"]}
          />
        </Route>
        <Route path="/search">
          <RequireStaff>
            <SearchPage />
          </RequireStaff>
        </Route>
        <Route path="/users">
          <ProtectedRoute component={UserManagement} allowedRoles={["admin"]} />
        </Route>
        <Route path="/analytics">
          <RequireStaff>
            <ExecutiveDashboard />
          </RequireStaff>
        </Route>
        <Route path="/analytics/defects">
          <RequireStaff>
            <DefectAnalysis />
          </RequireStaff>
        </Route>
        <Route path="/analytics/technicians">
          <RequireStaff>
            <TechnicianPerformance />
          </RequireStaff>
        </Route>
        <Route path="/analytics/technicians/:engineerId/coaching">
          <RequireStaff>
            <EngineerCoachingPack />
          </RequireStaff>
        </Route>
        <Route path="/analytics/sites">
          <RequireStaff>
            <SiteIntelligence />
          </RequireStaff>
        </Route>
        <Route path="/analytics/drift">
          <RequireStaff>
            <DriftDetection />
          </RequireStaff>
        </Route>
        <Route path="/analytics/predictive">
          <RequireStaff>
            <PredictiveRisk />
          </RequireStaff>
        </Route>
        <Route path="/portal/dashboard">
          <ProtectedRoute
            component={TechnicianDashboard}
            allowedRoles={["technician"]}
          />
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
        {/* Monitoring dashboard for ops */}
        <Route path="/monitoring">
          <ProtectedRoute
            component={Monitoring}
            allowedRoles={["admin", "qa_lead"]}
          />
        </Route>
        {/* PR-OPS-FLAGS / PX-071 — admin-only diagnostics (hide from qa_lead floor) */}
        <Route path="/ops/feature-flags">
          <ProtectedRoute
            component={FeatureFlagMatrix}
            allowedRoles={["admin"]}
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <ProcessingWatchdog />
            <Router />
            <OnboardingTour />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
