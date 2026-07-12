import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  useAnalyticsFilters,
  type AnalyticsPeriodPreset,
} from "@/hooks/useAnalyticsFilters";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Map,
  Users,
  AlertTriangle,
  Activity,
  BrainCircuit,
} from "lucide-react";
import { Link, useLocation } from "wouter";

interface AnalyticsLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
}

/** Live analytics routes only — Coming Soon pages stay out of nav (Phase 0). */
const navItems = [
  { href: "/analytics", label: "Overview", icon: LayoutDashboard },
  { href: "/analytics/defects", label: "Exceptions", icon: AlertTriangle },
  {
    href: "/analytics/technicians",
    label: "Technician Performance",
    icon: Users,
  },
  { href: "/analytics/sites", label: "Site Intelligence", icon: Map },
  { href: "/analytics/drift", label: "Drift Detection", icon: Activity },
  {
    href: "/analytics/predictive",
    label: "Predictive Risk",
    icon: BrainCircuit,
  },
];

const PERIOD_PRESETS: { value: AnalyticsPeriodPreset; label: string }[] = [
  { value: "7d", label: "1 week" },
  { value: "14d", label: "2 weeks" },
  { value: "21d", label: "3 weeks" },
  { value: "28d", label: "4 weeks" },
  { value: "90d", label: "90d" },
];

export function AnalyticsLayout({
  children,
  title,
  description,
}: AnalyticsLayoutProps) {
  const [location] = useLocation();
  const { preset, site, setPreset, setSite } = useAnalyticsFilters();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="pb-6 border-b border-border/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-muted-foreground mt-2 text-lg max-w-2xl">
                {description}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end shrink-0">
              <div
                className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit"
                role="group"
                aria-label="Analytics period"
              >
                {PERIOD_PRESETS.map(item => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={preset === item.value ? "default" : "ghost"}
                    className="h-8 px-3 text-xs"
                    onClick={() => setPreset(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <label className="w-full sm:w-64">
                <span className="sr-only">Filter analytics by site</span>
                <Input
                  type="text"
                  value={site}
                  onChange={event => setSite(event.target.value)}
                  placeholder="Filter by site"
                  aria-label="Filter analytics by site"
                  className="h-8 text-xs"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit flex-wrap">
          {navItems.map(item => {
            const isActive =
              item.href === "/analytics"
                ? location === "/analytics" || location === "/analytics/"
                : location === item.href ||
                  location.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
                    isActive
                      ? "bg-[rgba(190,218,65,0.18)] text-[#333030] shadow-none"
                      : "text-[#706D6D] hover:text-[#333030] hover:bg-[#F5F4F4]"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </a>
              </Link>
            );
          })}
        </div>

        <div className="min-h-[500px]">{children}</div>
      </div>
    </DashboardLayout>
  );
}
