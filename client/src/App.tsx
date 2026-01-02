import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/Upload";
import AuditResults from "./pages/AuditResults";
import HoldQueue from "./pages/HoldQueue";
import SpecManagement from "./pages/SpecManagement";
import SearchPage from "./pages/Search";
import UserManagement from "./pages/UserManagement";
import Analytics from "./pages/Analytics";


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
      <Route path={"/analytics"} component={Analytics} />
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
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
