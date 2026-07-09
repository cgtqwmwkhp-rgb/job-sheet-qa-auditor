import * as React from "react";
import { Search, FileText, User, AlertTriangle, BarChart2 } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useLocation } from "wouter";

export function CommandCenter() {
  const [open, setOpen] = React.useState(false);
  const [, setLocation] = useLocation();

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

  return (
    <>
      <button
        type="button"
        className="hidden md:flex items-center text-sm text-muted-foreground border rounded-md px-3 py-1.5 bg-muted/50 hover:bg-muted cursor-pointer transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen(true)}
        aria-label="Open command search"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="w-4 h-4 mr-2" aria-hidden="true" />
        <span>Search...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 ml-4">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => runCommand(() => setLocation("/"))}>
              <BarChart2 className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/audits"))}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>Audit Results</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/analytics"))}
            >
              <BarChart2 className="mr-2 h-4 w-4" />
              <span>Analytics Hub</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/analytics/ai"))}
            >
              <BarChart2 className="mr-2 h-4 w-4" />
              <span>AI Analyst</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/upload"))}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>Upload Job Sheet</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => setLocation("/search"))}
            >
              <Search className="mr-2 h-4 w-4" />
              <span>Advanced Search</span>
            </CommandItem>
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
