import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Clock, FileText, TrendingUp } from "lucide-react";
import { SmartTip } from "@/components/SmartTip";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuditTimeline } from "@/components/AuditTimeline";
import { useStats } from "@/lib/api";

// Mock Data
const stats = [
  {
    title: "Total Audits",
    value: "1,284",
    change: "+12.5%",
    trend: "up",
    icon: FileText,
    color: "text-blue-500",
  },
  {
    title: "Pass Rate",
    value: "94.2%",
    change: "+2.1%",
    trend: "up",
    icon: CheckCircle2,
    color: "text-brand-lime",
  },
  {
    title: "Hold Queue",
    value: "23",
    change: "-5",
    trend: "down",
    icon: Clock,
    color: "text-orange-500",
  },
  {
    title: "Critical Issues",
    value: "7",
    change: "+2",
    trend: "up",
    icon: AlertTriangle,
    color: "text-destructive",
  },
];

const activityData = [
  { name: "Mon", passed: 145, failed: 12 },
  { name: "Tue", passed: 132, failed: 8 },
  { name: "Wed", passed: 156, failed: 15 },
  { name: "Thu", passed: 165, failed: 10 },
  { name: "Fri", passed: 148, failed: 14 },
  { name: "Sat", passed: 85, failed: 4 },
  { name: "Sun", passed: 65, failed: 2 },
];

const defectTypes = [
  { name: "Missing Signature", value: 35, color: "#EF4444" },
  { name: "Unclear Photo", value: 25, color: "#F97316" },
  { name: "Missing Serial #", value: 20, color: "#EAB308" },
  { name: "Incorrect Date", value: 15, color: "#3B82F6" },
  { name: "Other", value: 5, color: "#64748B" },
];

export default function Dashboard() {
  const { data: statsData } = useStats();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-lg">
              Overview of job sheet audit performance and status.
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
                <div className="text-3xl font-bold font-heading tracking-tight">{stat.value}</div>
                <p className="text-xs font-medium mt-2 flex items-center gap-1.5">
                  <span className={`flex items-center px-1.5 py-0.5 rounded ${stat.trend === "up" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {stat.trend === "up" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1 rotate-180" />}
                    {stat.change}
                  </span>
                  <span className="text-muted-foreground">vs last month</span>
                </p>
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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#64748B" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="#64748B" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value}`} 
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Legend />
                    <Bar dataKey="passed" name="Passed" fill="#BEDA41" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" name="Failed" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={defectTypes}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {defectTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend layout="vertical" verticalAlign="middle" align="right" />
                  </PieChart>
                </ResponsiveContainer>
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
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${i % 3 === 0 ? 'bg-red-100 text-red-600' : 'bg-lime-100 text-lime-700'}`}>
                          {i % 3 === 0 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-medium font-mono">JS-2024-00{i}</p>
                          <p className="text-sm text-muted-foreground">Technician: John Doe • Site: London HQ</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{i % 3 === 0 ? 'FAILED' : 'PASSED'}</p>
                        <p className="text-xs text-muted-foreground">2 mins ago</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
            </Tabs>
          </div>
          
          {/* Audit Timeline */}
          <div className="col-span-1">
            {statsData?.recentActivity && (
              <AuditTimeline activities={statsData.recentActivity} />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
