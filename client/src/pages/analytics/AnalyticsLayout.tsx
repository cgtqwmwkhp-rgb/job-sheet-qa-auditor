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
      <div className="space-y-8">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">{title}</h1>
            <p className="text-muted-foreground mt-2 text-lg max-w-2xl">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-3 bg-card p-1.5 rounded-lg border shadow-sm">
            <CalendarDateRangePicker />
            <div className="h-6 w-px bg-border" />
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px] border-0 bg-transparent shadow-none focus:ring-0">
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                <SelectItem value="london">London HQ</SelectItem>
                <SelectItem value="manchester">Manchester Branch</SelectItem>
                <SelectItem value="leeds">Leeds Hub</SelectItem>
              </SelectContent>
            </Select>
            <div className="h-6 w-px bg-border" />
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  isActive 
                    ? "bg-white text-primary shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </a>
              </Link>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="min-h-[500px]">
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}
