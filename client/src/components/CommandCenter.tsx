import * as React from "react";
import {
  Search,
  FileText,
  User,
  AlertTriangle,
  BarChart2,
  LayoutDashboard,
  Upload,
  ShieldAlert,
  MessageSquareWarning,
  Activity,
  Settings,
  HelpCircle,
  CheckSquare,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export function CommandCenter() {
  const [open, setOpen] = React.useState(false);
  const [, setLocation] = useLocation();
  const { hasRole } = useAuth();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(open => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  const canDisputes = hasRole(["admin", "qa_lead"]);
  const canMonitoring = hasRole(["admin", "qa_lead"]);
  const canSettings = hasRole(["admin", "qa_lead"]);
  const canUsers = hasRole(["admin"]);
  const canAuditLog = hasRole(["admin"]);

  return (
    <>
      <button
        type="button"
        className="print:hidden hidden md:flex items-center text-sm text-[#706D6D] border border-[#EBE8E8] rounded-md px-3 py-1.5 bg-[#F9F9F9] hover:bg-[#F5F4F4] cursor-pointer transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen(true)}
        aria-label="Open command search"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="w-4 h-4 mr-2" aria-hidden="true" />
        <span>Search...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-[#EBE8E8] bg-white px-1.5 font-mono text-[10px] font-medium text-[#8A8787] opacity-100 ml-4">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => runCommand(() => setLocation("/"))}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/audits"))}
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              <span>Audit Results</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/hold-queue"))}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              <span>Hold Queue</span>
            </CommandItem>
            {canDisputes ? (
              <CommandItem
                onSelect={() => runCommand(() => setLocation("/disputes"))}
              >
                <MessageSquareWarning className="mr-2 h-4 w-4" />
                <span>Disputes</span>
              </CommandItem>
            ) : null}
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/search"))}
            >
              <Search className="mr-2 h-4 w-4" />
              <span>Search</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/analytics"))}
            >
              <BarChart2 className="mr-2 h-4 w-4" />
              <span>Analytics Hub</span>
            </CommandItem>
            {canMonitoring ? (
              <CommandItem
                onSelect={() => runCommand(() => setLocation("/monitoring"))}
              >
                <Activity className="mr-2 h-4 w-4" />
                <span>Monitoring</span>
              </CommandItem>
            ) : null}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/upload"))}
            >
              <Upload className="mr-2 h-4 w-4" />
              <span>Upload Job Sheet</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/template-studio"))}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>Template Studio</span>
            </CommandItem>
            {canSettings ? (
              <CommandItem
                onSelect={() => runCommand(() => setLocation("/settings"))}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </CommandItem>
            ) : null}
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/help"))}
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              <span>Help & Resources</span>
            </CommandItem>
            {canUsers ? (
              <CommandItem
                onSelect={() => runCommand(() => setLocation("/users"))}
              >
                <User className="mr-2 h-4 w-4" />
                <span>User Management</span>
              </CommandItem>
            ) : null}
            {canAuditLog ? (
              <CommandItem
                onSelect={() => runCommand(() => setLocation("/audit-log"))}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                <span>Audit Log</span>
              </CommandItem>
            ) : null}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Deep Dives">
            <CommandItem
              onSelect={() =>
                runCommand(() => setLocation("/analytics/technicians"))
              }
            >
              <User className="mr-2 h-4 w-4" />
              <span>Technician Performance</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => setLocation("/analytics/predictive"))
              }
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              <span>Predictive Risk</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => setLocation("/analytics/defects"))
              }
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              <span>Defect Analysis</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
