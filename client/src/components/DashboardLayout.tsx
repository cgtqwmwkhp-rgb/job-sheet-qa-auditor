import { AppSidebar } from "@/components/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { NotificationsDropdown } from "@/components/Notifications";
import { CommandCenter } from "@/components/CommandCenter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const PAGE_CONTEXT: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Dashboard",
    subtitle: "Overview & key metrics",
  },
  "/upload": {
    title: "Upload Job Cards",
    subtitle: "Single-job intake & processing",
  },
  "/audits": {
    title: "Audit Results",
    subtitle: "Review outcomes & evidence",
  },
  "/hold-queue": {
    title: "Hold Queue",
    subtitle: "Items awaiting manual review",
  },
  "/disputes": {
    title: "Disputes",
    subtitle: "Challenge resolution",
  },
  "/search": {
    title: "Search",
    subtitle: "Find job sheets & audits",
  },
  "/template-studio": {
    title: "Template Studio",
    subtitle: "Author & activate form templates",
  },
  "/specs": {
    title: "Template Studio",
    subtitle: "Author & activate form templates",
  },
  "/analytics": {
    title: "Analytics",
    subtitle: "Performance insights",
  },
  "/monitoring": {
    title: "Monitoring",
    subtitle: "System health & pipelines",
  },
  "/users": {
    title: "User Management",
    subtitle: "Roles & access",
  },
  "/audit-log": {
    title: "Audit Log",
    subtitle: "Activity history",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Preferences & configuration",
  },
  "/help": {
    title: "Help & Resources",
    subtitle: "Guides & support",
  },
};

function resolvePageContext(pathname: string) {
  if (PAGE_CONTEXT[pathname]) {
    return PAGE_CONTEXT[pathname];
  }

  const match = Object.keys(PAGE_CONTEXT)
    .filter(route => route !== "/")
    .sort((a, b) => b.length - a.length)
    .find(route => pathname === route || pathname.startsWith(`${route}/`));

  if (match) {
    return PAGE_CONTEXT[match];
  }

  return {
    title: "Job Sheet QA",
    subtitle: "PlantExpand Portal",
  };
}

/**
 * Staff app shell — PlantExpand Portal chrome
 * (white sidebar, lime header mark, gray-50 canvas).
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const page = resolvePageContext(location);

  return (
    <SidebarProvider>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <AppSidebar />
      <SidebarInset className="bg-[#F9F9F9]">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[#EBE8E8] bg-white/95 px-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <SidebarTrigger className="-ml-1 text-[#333030] hover:bg-[#F5F4F4]" />
          <div className="h-4 w-px bg-[#EBE8E8]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-[#333030]">
              {page.title}
            </p>
            <p className="truncate text-xs text-[#8A8787]">{page.subtitle}</p>
          </div>
          <CommandCenter />
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <NotificationsDropdown />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-[#333030] hover:bg-[#F5F4F4]"
                  aria-label="Account menu"
                >
                  <User className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {user?.name || user?.email || "My Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => logout()}
                >
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-auto bg-[#F9F9F9] p-6 text-[#333030] outline-none"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
