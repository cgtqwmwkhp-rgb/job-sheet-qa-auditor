import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  useAnalyticsFilters,
  type AnalyticsPeriodPreset,
} from "@/hooks/useAnalyticsFilters";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Map,
  Users,
  AlertTriangle,
  Activity,
  BrainCircuit,
  CalendarRange,
  MapPin,
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
  { value: "90d", label: "90 days" },
];

function formatPeriodRange(startDate: string, endDate: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${new Date(startDate).toLocaleDateString(undefined, opts)} – ${new Date(endDate).toLocaleDateString(undefined, opts)}`;
}

export function AnalyticsLayout({
  children,
  title,
  description,
}: AnalyticsLayoutProps) {
  const [location] = useLocation();
  const { preset, startDate, endDate, site, setPreset, setSite } =
    useAnalyticsFilters();
  const periodLabel = formatPeriodRange(startDate, endDate);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-muted-foreground text-base max-w-3xl">
            {description}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 sm:p-5 shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                Reporting period
              </div>
              <div
                className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/60 rounded-lg w-fit"
                role="group"
                aria-label="Analytics period"
              >
                {PERIOD_PRESETS.map(item => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={preset === item.value ? "default" : "ghost"}
                    className={cn(
                      "h-9 px-3.5 text-xs font-medium",
                      preset === item.value && "shadow-none"
                    )}
                    onClick={() => setPreset(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>

            <label className="w-full lg:w-72 shrink-0">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Site filter
              </span>
              <Input
                type="text"
                value={site}
                onChange={event => setSite(event.target.value)}
                placeholder="All sites — type to narrow"
                aria-label="Filter analytics by site"
                className="h-10 text-sm bg-white"
              />
            </label>
          </div>
        </div>

        <nav
          aria-label="Analytics sections"
          className="border-b border-border bg-white rounded-t-xl"
        >
          <div className="flex gap-0 overflow-x-auto scrollbar-none -mb-px">
            {navItems.map(item => {
              const isActive =
                item.href === "/analytics"
                  ? location === "/analytics" || location === "/analytics/"
                  : location === item.href ||
                    location.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                      isActive
                        ? "border-primary bg-[rgba(190,218,65,0.12)] text-[#333030]"
                        : "border-transparent text-[#706D6D] hover:text-[#333030] hover:bg-[#F5F4F4]"
                    )}
                  >
                    {isActive ? (
                      <span
                        className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </a>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="min-h-[480px]">{children}</div>
      </div>
    </DashboardLayout>
  );
}
