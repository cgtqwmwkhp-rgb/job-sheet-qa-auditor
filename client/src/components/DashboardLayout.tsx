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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Staff app shell — PlantExpand Portal chrome
 * (white sidebar, lime header mark, gray-50 canvas).
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <SidebarProvider>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <AppSidebar />
      <SidebarInset className="bg-[#F9F9F9]">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#EBE8E8] bg-white px-3 sticky top-0 z-10">
          <SidebarTrigger className="-ml-1 text-[#333030] hover:bg-[#F5F4F4]" />
          <div className="w-px h-4 bg-[#EBE8E8] mx-1.5" aria-hidden="true" />
          <div className="flex-1" />
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
          className="flex-1 p-6 overflow-auto outline-none bg-[#F9F9F9] text-[#333030]"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
