import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  CheckSquare,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  ShieldAlert,
  Upload,
  Users,
  MessageSquareWarning,
  HelpCircle,
  Activity,
  Flag,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

/** Portal-aligned primary nav (UI_STYLE_GUIDE_PORTABLE §7.5). */
const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Upload Job Cards", url: "/upload", icon: Upload },
  { title: "Audit Results", url: "/audits", icon: CheckSquare },
  { title: "Hold Queue", url: "/hold-queue", icon: ShieldAlert },
  { title: "Disputes", url: "/disputes", icon: MessageSquareWarning },
  { title: "Search", url: "/search", icon: Search },
  { title: "Template Studio", url: "/template-studio", icon: FileText },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Monitoring", url: "/monitoring", icon: Activity },
  { title: "Feature Flags", url: "/ops/feature-flags", icon: Flag },
  { title: "User Management", url: "/users", icon: Users },
  { title: "Audit Log", url: "/audit-log", icon: ShieldAlert },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { hasRole } = useAuth();

  const filteredItems = items.filter(item => {
    if (item.title === "Template Studio") {
      return hasRole(["admin", "qa_lead"]);
    }
    if (item.title === "Disputes") {
      return hasRole(["admin", "qa_lead"]);
    }
    if (item.title === "Audit Log") {
      return hasRole(["admin"]);
    }
    if (item.title === "User Management") {
      return hasRole(["admin"]);
    }
    if (
      item.title === "Settings" ||
      item.title === "Monitoring" ||
      item.title === "Feature Flags"
    ) {
      return hasRole(["admin", "qa_lead"]);
    }
    return true;
  });

  const isActive = (url: string) =>
    url === "/"
      ? location === "/"
      : location === url || location.startsWith(`${url}/`);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="flex h-14 items-center justify-center border-b border-sidebar-border bg-primary px-2">
        <BrandLogo
          className="w-full px-1 text-primary-foreground"
          markClassName="h-8 w-8 rounded-md bg-white p-0.5"
          subtitle="Job Sheet QA"
        />
      </SidebarHeader>
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[10px] font-semibold uppercase tracking-wider text-[#8A8787]">
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-1">
              {filteredItems.map(item => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        "relative mx-1 rounded-lg border-l-[3px] border-transparent text-sm text-[#706D6D] transition-colors duration-[var(--duration-normal)] hover:bg-[#F5F4F4] hover:text-[#333030]",
                        active &&
                          "border-l-primary bg-[rgba(190,218,65,0.15)] font-semibold text-[#333030] hover:bg-[rgba(190,218,65,0.22)] hover:text-[#333030]"
                      )}
                    >
                      <Link href={item.url}>
                        <item.icon
                          className={cn(
                            "size-4 stroke-[1.5] transition-colors duration-[var(--duration-normal)]",
                            active ? "text-primary" : "text-[#8A8787]"
                          )}
                        />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border bg-sidebar p-3">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Help & Resources"
              isActive={isActive("/help")}
              className={cn(
                "mx-1 rounded-lg border-l-[3px] border-transparent text-[#706D6D] transition-colors duration-[var(--duration-normal)] hover:bg-[#F5F4F4] hover:text-[#333030]",
                isActive("/help") &&
                  "border-l-primary bg-[rgba(190,218,65,0.15)] font-semibold text-[#333030]"
              )}
            >
              <Link href="/help">
                <HelpCircle className="size-4 stroke-[1.5]" />
                <span>Help & Resources</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {hasRole(["admin", "qa_lead"]) ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Settings"
                isActive={isActive("/settings")}
                className={cn(
                  "mx-1 rounded-lg border-l-[3px] border-transparent text-[#706D6D] transition-colors duration-[var(--duration-normal)] hover:bg-[#F5F4F4] hover:text-[#333030]",
                  isActive("/settings") &&
                    "border-l-primary bg-[rgba(190,218,65,0.15)] font-semibold text-[#333030]"
                )}
              >
                <Link href="/settings">
                  <Settings className="size-4 stroke-[1.5]" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
