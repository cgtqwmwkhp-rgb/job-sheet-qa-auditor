import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsLayout } from "./AnalyticsLayout";
import { CheckCircle2, FileText, AlertTriangle, Users, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, Cell } from "recharts";

// Mock Data
const performanceData = [
  { date: "Jan 01", passRate: 92, volume: 145, target: 95 },
  { date: "Jan 02", passRate: 94, volume: 132, target: 95 },
  { date: "Jan 03", passRate: 91, volume: 156, target: 95 },
  { date: "Jan 04", passRate: 95, volume: 165, target: 95 },
  { date: "Jan 05", passRate: 93, volume: 148, target: 95 },
  { date: "Jan 06", passRate: 96, volume: 85, target: 95 },
  { date: "Jan 07", passRate: 94, volume: 65, target: 95 },
];

const topDefects = [
  { name: "Missing Signature", count: 145, impact: "High" },
  { name: "Unclear Photo", count: 89, impact: "Medium" },
  { name: "Missing Serial #", count: 67, impact: "Medium" },
  { name: "Incorrect Date", count: 45, impact: "Low" },
];

export default function ExecutiveDashboard() {
  return (
    <AnalyticsLayout 
      title="Executive Overview" 
      description="High-level operational metrics and performance trends."
    >
      <div className="space-y-6">
        {/* KPI Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard 
            title="Overall Pass Rate" 
            value="94.2%" 
            trend="+2.1%" 
            trendDirection="up"
            icon={CheckCircle2}
            color="text-green-500"
          />
          <KpiCard 
            title="Total Audits" 
            value="1,284" 
            trend="+12.5%" 
            trendDirection="up"
            icon={FileText}
            color="text-blue-500"
          />
          <KpiCard 
            title="Critical Defects" 
            value="7" 
            trend="+2" 
            trendDirection="down" // Down is bad for defects, but here +2 means more defects which is bad
            icon={AlertTriangle}
            color="text-red-500"
            inverseTrend
          />
          <KpiCard 
            title="Active Technicians" 
            value="42" 
            trend="+4" 
            trendDirection="up"
            icon={Users}
            color="text-orange-500"
          />
        </div>

        {/* Main Charts */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Performance Trend */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Audit Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} unit="%" domain={[80, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="passRate" name="Pass Rate" stroke="#22C55E" strokeWidth={2} fillOpacity={1} fill="url(#colorPass)" />
                    <Area type="monotone" dataKey="target" name="Target" stroke="#94A3B8" strokeDasharray="5 5" fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Defects */}
          <Card>
            <CardHeader>
              <CardTitle>Top Defect Drivers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topDefects.map((defect, i) => (
                  <div key={defect.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 font-bold text-sm">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{defect.name}</p>
                        <p className="text-xs text-muted-foreground">{defect.impact} Impact</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{defect.count}</p>
                      <p className="text-xs text-muted-foreground">occurrences</p>
                    </div>
                  </div>
                ))}
                <div className="pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Defects</span>
                    <span className="font-bold">346</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AnalyticsLayout>
  );
}

function KpiCard({ title, value, trend, trendDirection, icon: Icon, color, inverseTrend }: any) {
  const isPositive = trendDirection === "up";
  const isGood = inverseTrend ? !isPositive : isPositive;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs mt-1 flex items-center ${isGood ? "text-green-600" : "text-red-600"}`}>
          {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
          {trend} from last month
        </p>
      </CardContent>
    </Card>
  );
}
