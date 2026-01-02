import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { CalendarDateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, LayoutDashboard, Map, Users, AlertTriangle, FileText, Wrench } from "lucide-react";
import { Link, useLocation } from "wouter";

interface AnalyticsLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
}

export function AnalyticsLayout({ children, title, description }: AnalyticsLayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/analytics", label: "Overview", icon: LayoutDashboard },
    { href: "/analytics/defects", label: "Defect Analysis", icon: AlertTriangle },
    { href: "/analytics/technicians", label: "Technician Performance", icon: Users },
    { href: "/analytics/first-fix", label: "First Fix Rate", icon: Wrench },
    { href: "/analytics/sites", label: "Site Intelligence", icon: Map },
    { href: "/analytics/reports", label: "Custom Reports", icon: FileText },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDateRangePicker />
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                <SelectItem value="london">London HQ</SelectItem>
                <SelectItem value="manchester">Manchester Branch</SelectItem>
                <SelectItem value="leeds">Leeds Hub</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="border-b">
          <div className="flex h-10 items-center gap-4">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <a className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                    isActive 
                      ? "text-primary border-b-2 border-primary h-10" 
                      : "text-muted-foreground"
                  }`}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </a>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-[500px]">
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}
