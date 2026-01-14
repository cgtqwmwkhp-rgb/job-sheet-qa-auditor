import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsLayout } from "./AnalyticsLayout";
import { CheckCircle2, FileText, AlertTriangle, Users, TrendingUp, BarChart3, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ExecutiveDashboard() {
  // Use real data from the stats endpoint
  const { data: statsData, isLoading, error } = trpc.stats.dashboard.useQuery();
  
  // Calculate real KPIs from stats
  const totalAudits = statsData?.totalAudits ?? 0;
  const passRate = statsData?.passRate ?? 0;
  const criticalIssues = statsData?.criticalIssues ?? 0;
  const reviewQueue = statsData?.reviewQueue ?? 0;
  
  // Check if we have any real data
  const hasData = totalAudits > 0;

  if (isLoading) {
    return (
      <AnalyticsLayout 
        title="Executive Overview" 
        description="High-level operational metrics and performance trends."
      >
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading analytics...</span>
        </div>
      </AnalyticsLayout>
    );
  }

  if (error) {
    return (
      <AnalyticsLayout 
        title="Executive Overview" 
        description="High-level operational metrics and performance trends."
      >
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to Load Analytics</h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </AnalyticsLayout>
    );
  }

  if (!hasData) {
    return (
      <AnalyticsLayout 
        title="Executive Overview" 
        description="High-level operational metrics and performance trends."
      >
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Analytics Data Yet</h2>
            <p className="text-muted-foreground max-w-md">
              Upload and process job sheets to start seeing executive analytics and insights here.
            </p>
          </div>
        </Card>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout 
      title="Executive Overview" 
      description="High-level operational metrics and performance trends."
    >
      <div className="space-y-6">
        {/* KPI Grid - Real Data */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Pass Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{passRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on completed audits
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Audits</CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAudits.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time processed
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${criticalIssues > 0 ? 'text-red-600' : ''}`}>
                {criticalIssues}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Requires attention
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Review Queue</CardTitle>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${reviewQueue > 0 ? 'text-orange-600' : ''}`}>
                {reviewQueue}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pending review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts - Coming Soon */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Audit Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-[300px] text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Performance Trends Coming Soon</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Historical trend analysis will be available once sufficient audit data is collected.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Defect Drivers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-[300px] text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Defect Analysis Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                  Defect categorization and impact analysis will be available in a future update.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AnalyticsLayout>
  );
}
