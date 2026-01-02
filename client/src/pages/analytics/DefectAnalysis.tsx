import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ComposedChart, Line } from "recharts";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";

// Mock Data for Pareto Chart
const paretoData = [
  { name: "Missing Signature", count: 145, cumulative: 35 },
  { name: "Unclear Photo", count: 89, cumulative: 56 },
  { name: "Missing Serial #", count: 67, cumulative: 72 },
  { name: "Incorrect Date", count: 45, cumulative: 83 },
  { name: "Blurry Text", count: 32, cumulative: 91 },
  { name: "Wrong Form", count: 21, cumulative: 96 },
  { name: "Other", count: 17, cumulative: 100 },
];

// Mock Data for Heatmap (Day vs Hour)
const heatmapData = [
  { day: "Mon", hour: "08:00", value: 12 },
  { day: "Mon", hour: "10:00", value: 25 },
  { day: "Mon", hour: "14:00", value: 18 },
  { day: "Tue", hour: "09:00", value: 30 },
  { day: "Tue", hour: "11:00", value: 45 }, // High failure
  { day: "Wed", hour: "16:00", value: 55 }, // Peak failure
  { day: "Thu", hour: "10:00", value: 22 },
  { day: "Fri", hour: "15:00", value: 40 },
];

const defectTypes = [
  { name: "Compliance", value: 45, color: "#ef4444" },
  { name: "Data Quality", value: 30, color: "#f97316" },
  { name: "Process", value: 15, color: "#eab308" },
  { name: "Technical", value: 10, color: "#3b82f6" },
];

export default function DefectAnalysis() {
  return (
    <AnalyticsLayout 
      title="Defect Analysis" 
      description="Deep dive into failure modes, root causes, and defect distribution."
    >
      <Tabs defaultValue="pareto" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pareto">Pareto Analysis</TabsTrigger>
          <TabsTrigger value="heatmap">Time Heatmap</TabsTrigger>
          <TabsTrigger value="breakdown">Category Breakdown</TabsTrigger>
        </TabsList>

        {/* Pareto Analysis Tab */}
        <TabsContent value="pareto" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Defect Pareto Chart (80/20 Rule)</CardTitle>
                <CardDescription>
                  Focus on the top 3 defects to resolve 72% of all issues.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paretoData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar yAxisId="left" dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                      <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Priority Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-900">Fix "Missing Signature"</h4>
                      <p className="text-sm text-red-700 mt-1">
                        Accounts for 35% of all failures. Consider making the signature field mandatory in the mobile app.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-orange-900">Improve Photo Quality</h4>
                      <p className="text-sm text-orange-700 mt-1">
                        "Unclear Photo" is the #2 issue. Deploy training on proper lighting and focus.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Heatmap Tab */}
        <TabsContent value="heatmap">
          <Card>
            <CardHeader>
              <CardTitle>Defect Frequency Heatmap</CardTitle>
              <CardDescription>Identify high-risk time windows for audit failures.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center border rounded-md bg-muted/10">
                <p className="text-muted-foreground">
                  [Heatmap Visualization Placeholder - Would use a specialized library like @nivo/heatmap in production]
                </p>
                {/* In a real implementation, we'd use a grid of colored cells here */}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Defects by Category</CardTitle>
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
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {defectTypes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Category Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {defectTypes.map((type) => (
                  <div key={type.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                      <span className="font-medium">{type.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ width: `${type.value}%`, backgroundColor: type.color }} 
                        />
                      </div>
                      <span className="text-sm font-bold w-8">{type.value}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AnalyticsLayout>
  );
}
