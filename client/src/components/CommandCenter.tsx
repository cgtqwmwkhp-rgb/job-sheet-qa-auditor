import * as React from "react";
import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
  Search,
  FileText,
  Map,
  AlertTriangle,
  BarChart2
} from "lucide-react";

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
        setOpen((open) => !open);
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
      <div className="hidden md:flex items-center text-sm text-muted-foreground border rounded-md px-3 py-1.5 bg-muted/50 hover:bg-muted cursor-pointer transition-colors" onClick={() => setOpen(true)}>
        <Search className="w-4 h-4 mr-2" />
        <span>Search...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 ml-4">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>
      
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => runCommand(() => setLocation("/"))}>
              <BarChart2 className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/audits"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Audit Results</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/analytics"))}>
              <BarChart2 className="mr-2 h-4 w-4" />
              <span>Analytics Hub</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/analytics/ai"))}>
              <Smile className="mr-2 h-4 w-4" />
              <span>AI Analyst</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => runCommand(() => setLocation("/upload"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Upload Job Sheet</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/search"))}>
              <Search className="mr-2 h-4 w-4" />
              <span>Advanced Search</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Deep Dives">
            <CommandItem onSelect={() => runCommand(() => setLocation("/analytics/technicians"))}>
              <User className="mr-2 h-4 w-4" />
              <span>Technician Performance</span>
            </CommandItem>

            <CommandItem onSelect={() => runCommand(() => setLocation("/analytics/defects"))}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              <span>Defect Analysis</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
