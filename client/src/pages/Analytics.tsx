import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDateRangePicker } from "@/components/ui/date-range-picker";
import { Download, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Users, FileText } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Mock Data for Enterprise Analytics
const performanceData = [
  { date: "Jan 01", passRate: 92, volume: 145 },
  { date: "Jan 02", passRate: 94, volume: 132 },
  { date: "Jan 03", passRate: 91, volume: 156 },
  { date: "Jan 04", passRate: 95, volume: 165 },
  { date: "Jan 05", passRate: 93, volume: 148 },
  { date: "Jan 06", passRate: 96, volume: 85 },
  { date: "Jan 07", passRate: 94, volume: 65 },
];

const defectTrends = [
  { name: "Missing Signature", count: 145, trend: "+12%" },
  { name: "Unclear Photo", count: 89, trend: "-5%" },
  { name: "Missing Serial #", count: 67, trend: "+2%" },
  { name: "Incorrect Date", count: 45, trend: "-8%" },
  { name: "Blurry Document", count: 34, trend: "+1%" },
];

const technicianPerformance = [
  { name: "John Doe", audits: 145, passRate: 98, defects: 3 },
  { name: "Jane Smith", audits: 132, passRate: 96, defects: 5 },
  { name: "Mike Johnson", audits: 156, passRate: 92, defects: 12 },
  { name: "Sarah Wilson", audits: 124, passRate: 99, defects: 1 },
  { name: "Tom Brown", audits: 98, passRate: 88, defects: 11 },
];

export default function Analytics() {
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

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Pass Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">94.2%</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center text-green-600">
                <TrendingUp className="w-3 h-3 mr-1" /> +2.1% from last month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Audits Processed</CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,284</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center text-green-600">
                <TrendingUp className="w-3 h-3 mr-1" /> +12.5% from last month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Defects</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">7</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center text-red-600">
                <TrendingUp className="w-3 h-3 mr-1" /> +2 from last month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Technicians</CardTitle>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">42</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center text-green-600">
                <TrendingUp className="w-3 h-3 mr-1" /> +4 new this month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList>
            <TabsTrigger value="performance">Performance Trends</TabsTrigger>
            <TabsTrigger value="defects">Defect Analysis</TabsTrigger>
            <TabsTrigger value="technicians">Technician Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Audit Volume vs Pass Rate</CardTitle>
                <CardDescription>Daily breakdown of audit volume and quality metrics.</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData}>
                      <defs>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22C55E" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="volume" name="Audit Volume" stroke="#3B82F6" fillOpacity={1} fill="url(#colorVolume)" />
                      <Area yAxisId="right" type="monotone" dataKey="passRate" name="Pass Rate" stroke="#22C55E" fillOpacity={1} fill="url(#colorPass)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="defects" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Defect Categories</CardTitle>
                  <CardDescription>Most frequent reasons for audit failure.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={defectTrends} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E2E8F0" />
                        <XAxis type="number" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} width={120} />
                        <Tooltip cursor={{ fill: 'transparent' }} />
                        <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Defect Distribution</CardTitle>
                  <CardDescription>Proportion of defect types across all audits.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={defectTrends}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={5}
                          dataKey="count"
                        >
                          {defectTrends.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#EF4444', '#F97316', '#EAB308', '#3B82F6', '#64748B'][index % 5]} />
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
          </TabsContent>

          <TabsContent value="technicians" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Technician Performance Leaderboard</CardTitle>
                <CardDescription>Top performing technicians based on pass rate and volume.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {technicianPerformance.map((tech, i) => (
                    <div key={tech.name} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-medium">{tech.name}</p>
                          <p className="text-sm text-muted-foreground">{tech.audits} audits processed</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-sm font-medium text-muted-foreground">Defects</p>
                          <p className="font-bold text-red-600">{tech.defects}</p>
                        </div>
                        <div className="text-right w-24">
                          <p className="text-sm font-medium text-muted-foreground">Pass Rate</p>
                          <div className="flex items-center justify-end gap-2">
                            <span className={`font-bold ${tech.passRate >= 95 ? 'text-green-600' : tech.passRate >= 90 ? 'text-orange-600' : 'text-red-600'}`}>
                              {tech.passRate}%
                            </span>
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${tech.passRate >= 95 ? 'bg-green-600' : tech.passRate >= 90 ? 'bg-orange-600' : 'bg-red-600'}`} 
                                style={{ width: `${tech.passRate}%` }} 
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
