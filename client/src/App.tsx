import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/Upload";
import AuditResults from "./pages/AuditResults";
import HoldQueue from "./pages/HoldQueue";
import SpecManagement from "./pages/SpecManagement";
import SearchPage from "./pages/Search";
import UserManagement from "./pages/UserManagement";
import ExecutiveDashboard from "./pages/analytics/ExecutiveDashboard";
import DefectAnalysis from "./pages/analytics/DefectAnalysis";
import TechnicianPerformance from "./pages/analytics/TechnicianPerformance";

import AIAnalyst from "./pages/analytics/AIAnalyst";
import ReportStudio from "./pages/analytics/ReportStudio";
import PortalLogin from "./pages/portal/PortalLogin";
import TechnicianDashboard from "./pages/portal/TechnicianDashboard";
import DisputeManagement from "./pages/DisputeManagement";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";


function Router() {
  return (
    <Switch>
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
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
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
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
