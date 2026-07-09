import DashboardLayout from "@/components/DashboardLayout";
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

export function AnalyticsLayout({
  children,
  title,
  description,
}: AnalyticsLayoutProps) {
  const [location] = useLocation();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="pb-6 border-b border-border/50">
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-muted-foreground mt-2 text-lg max-w-2xl">
            {description}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit flex-wrap">
          {navItems.map(item => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    isActive
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/50"
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
