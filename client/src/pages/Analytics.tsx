import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDateRangePicker } from "@/components/ui/date-range-picker";
import { Download, TrendingUp, AlertTriangle, CheckCircle2, Users, FileText, Loader2, BarChart3 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";

export default function Analytics() {
  // Use real data from the stats endpoint
  const { data: statsData, isLoading: statsLoading, error } = trpc.stats.dashboard.useQuery();
  
  // Calculate real KPIs from stats
  const totalAudits = statsData?.totalAudits ?? 0;
  const passRate = statsData?.passRate ?? 0;
  const criticalIssues = statsData?.criticalIssues ?? 0;
  const reviewQueue = statsData?.reviewQueue ?? 0;
  
  // Check if we have any real data
  const hasData = totalAudits > 0;
  
  // Loading state
  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading analytics...</span>
        </div>
      </DashboardLayout>
    );
  }
  
  // Error state
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to Load Analytics</h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Deep dive into audit performance, defect trends, and operational metrics.
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

        {/* KPI Cards - Using Real Data */}
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
              <CardTitle className="text-sm font-medium">Total Audits Processed</CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAudits.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{criticalIssues}</div>
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
              <div className="text-2xl font-bold">{reviewQueue}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pending review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trends" disabled={!hasData}>Trends (Coming Soon)</TabsTrigger>
            <TabsTrigger value="technicians" disabled={!hasData}>Technicians (Coming Soon)</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {hasData ? (
              <Card>
                <CardHeader>
                  <CardTitle>Audit Summary</CardTitle>
                  <CardDescription>Current status of your audit pipeline.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-8 w-8 text-green-500" />
                          <div>
                            <p className="font-semibold">Pass Rate</p>
                            <p className="text-sm text-muted-foreground">Overall quality score</p>
                          </div>
                        </div>
                        <span className="text-3xl font-bold text-green-600">{passRate}%</span>
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-blue-500" />
                          <div>
                            <p className="font-semibold">Total Processed</p>
                            <p className="text-sm text-muted-foreground">All time audits</p>
                          </div>
                        </div>
                        <span className="text-3xl font-bold">{totalAudits}</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-8 w-8 text-red-500" />
                          <div>
                            <p className="font-semibold">Critical Issues</p>
                            <p className="text-sm text-muted-foreground">Needs attention</p>
                          </div>
                        </div>
                        <span className={`text-3xl font-bold ${criticalIssues > 0 ? 'text-red-600' : 'text-green-600'}`}>{criticalIssues}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Users className="h-8 w-8 text-orange-500" />
                          <div>
                            <p className="font-semibold">Review Queue</p>
                            <p className="text-sm text-muted-foreground">Pending review</p>
                          </div>
                        </div>
                        <span className={`text-3xl font-bold ${reviewQueue > 0 ? 'text-orange-600' : 'text-green-600'}`}>{reviewQueue}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No Analytics Data Yet</h2>
                  <p className="text-muted-foreground max-w-md">
                    Upload and process job sheets to start seeing analytics and insights here.
                  </p>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Trends Coming Soon</h2>
                <p className="text-muted-foreground max-w-md">
                  Performance trends and time-series analytics will be available in a future update.
                </p>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="technicians" className="space-y-4">
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Users className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Technician Leaderboard Coming Soon</h2>
                <p className="text-muted-foreground max-w-md">
                  Technician performance metrics will be available in a future update.
                </p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
