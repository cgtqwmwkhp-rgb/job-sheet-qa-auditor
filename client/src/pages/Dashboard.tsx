import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Clock, FileText, TrendingUp, Loader2 } from "lucide-react";
import { SmartTip } from "@/components/SmartTip";
// Chart components available when real analytics data is implemented
// import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuditTimeline } from "@/components/AuditTimeline";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

// Chart data will be populated from real analytics
// Empty arrays show "No data yet" state

export default function Dashboard() {
  const [, setLocation] = useLocation();
  // Use real tRPC data
  const { data: statsData, isLoading: statsLoading } = trpc.stats.dashboard.useQuery();
  const { data: recentJobSheets, isLoading: jobSheetsLoading } = trpc.jobSheets.list.useQuery({ limit: 5 });
  const { user } = useAuth();

  const getGreeting = () => {
    if (!user) return "Welcome back";
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    
    const criticalCount = statsData?.criticalIssues ?? 0;
    const queueCount = statsData?.reviewQueue ?? 0;
    const passRate = statsData?.passRate ?? '0';
    
    if (user.role === 'admin') {
      return `${timeGreeting}, ${user.name}. You have ${criticalCount} critical issue${criticalCount !== 1 ? 's' : ''} requiring attention.`;
    } else if (user.role === 'qa_lead') {
      return `${timeGreeting}, ${user.name}. The hold queue has ${queueCount} item${queueCount !== 1 ? 's' : ''} pending review.`;
    } else {
      return `${timeGreeting}, ${user.name}. Your current pass rate is ${passRate}%.`;
    }
  };

  // Build stats array from real data
  const stats = [
    {
      title: "Total Audits",
      value: statsLoading ? "..." : (statsData?.totalAudits ?? 0).toLocaleString(),
      icon: FileText,
      color: "text-blue-500",
    },
    {
      title: "Pass Rate",
      value: statsLoading ? "..." : `${statsData?.passRate ?? 0}%`,
      icon: CheckCircle2,
      color: "text-brand-lime",
    },
    {
      title: "Hold Queue",
      value: statsLoading ? "..." : (statsData?.reviewQueue ?? 0).toString(),
      icon: Clock,
      color: "text-orange-500",
    },
    {
      title: "Critical Issues",
      value: statsLoading ? "..." : (statsData?.criticalIssues ?? 0).toString(),
      icon: AlertTriangle,
      color: "text-destructive",
    },
  ];

  // Activity timeline will be populated from real audit log data
  const recentActivity: { id: number; type: "audit" | "review" | "system"; message: string; time: string }[] = [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-lg">
              {getGreeting()}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 px-4 py-1.5 rounded-full border border-green-200 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            System Operational
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="group hover:shadow-lg transition-all duration-300 border-l-4 border-l-transparent hover:border-l-primary overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <stat.icon className={`h-16 w-16 ${stat.color}`} />
              </div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  {stat.title}
                  {stat.title === "Total Audits" && <SmartTip content="Total number of job sheets processed by the system in the current period." />}
                  {stat.title === "Pass Rate" && <SmartTip content="Percentage of job sheets that met all Gold Standard criteria without manual intervention." />}
                  {stat.title === "Hold Queue" && <SmartTip content="Job sheets flagged for manual review due to low confidence or ambiguity." />}
                  {stat.title === "Critical Issues" && <SmartTip content="Number of S0/S1 defects detected (e.g., missing safety signatures) requiring immediate attention." />}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold font-heading tracking-tight">
                  {statsLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    stat.value
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Charts Area */}
        <div className="grid gap-4 md:grid-cols-7">
          {/* Activity Chart */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Audit Activity</CardTitle>
              <CardDescription>
                Daily audit volume and pass/fail breakdown.
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No audit activity data yet.</p>
                  <p className="text-sm">Process job sheets to see activity trends.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Defect Breakdown */}
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Top Defect Reasons</CardTitle>
              <CardDescription>
                Breakdown of reasons for audit failure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No defect data yet.</p>
                  <p className="text-sm">Defect breakdown will appear after audits complete.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2">
            {/* Recent Activity Tabs */}
            <Tabs defaultValue="recent" className="space-y-4">
              <TabsList>
                <TabsTrigger value="recent">Recent Audits</TabsTrigger>
                <TabsTrigger value="hold">Hold Queue</TabsTrigger>
                <TabsTrigger value="alerts">System Alerts</TabsTrigger>
              </TabsList>
              <TabsContent value="recent" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Audits</CardTitle>
                    <CardDescription>
                      Latest job sheets processed by the system.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {jobSheetsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : recentJobSheets && recentJobSheets.length > 0 ? (
                      <div className="space-y-4">
                        {recentJobSheets.map((sheet) => (
                          <div 
                            key={sheet.id} 
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setLocation(`/audits?id=${sheet.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && setLocation(`/audits?id=${sheet.id}`)}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                sheet.status === 'failed' ? 'bg-red-100 text-red-600' : 
                                sheet.status === 'review_queue' ? 'bg-orange-100 text-orange-600' :
                                'bg-lime-100 text-lime-700'
                              }`}>
                                {sheet.status === 'failed' ? <AlertTriangle className="w-5 h-5" /> : 
                                 sheet.status === 'review_queue' ? <Clock className="w-5 h-5" /> :
                                 <CheckCircle2 className="w-5 h-5" />}
                              </div>
                              <div>
                                <p className="font-medium font-mono">{sheet.referenceNumber || `JS-${sheet.id}`}</p>
                                <p className="text-sm text-muted-foreground">
                                  {sheet.fileName} • {sheet.siteInfo || 'No site info'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold text-sm ${
                                sheet.status === 'failed' ? 'text-red-600' :
                                sheet.status === 'review_queue' ? 'text-orange-600' :
                                sheet.status === 'completed' ? 'text-green-600' :
                                'text-muted-foreground'
                              }`}>
                                {sheet.status.toUpperCase().replace('_', ' ')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(sheet.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No job sheets uploaded yet.</p>
                        <p className="text-sm">Upload your first job sheet to get started.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="hold" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Hold Queue</CardTitle>
                    <CardDescription>
                      Items requiring manual review.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No items in the hold queue.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="alerts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>System Alerts</CardTitle>
                    <CardDescription>
                      Important notifications and warnings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No active alerts.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          
          {/* Audit Timeline */}
          <div className="col-span-1">
            <AuditTimeline activities={recentActivity} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
