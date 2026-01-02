import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Wrench, Users, Building2, ChevronRight, ArrowLeft, Sparkles, BrainCircuit, GraduationCap, History, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CostCalculator } from "@/components/CostCalculator";
import { CoachingCard } from "@/components/CoachingCard";
import { DeepNoteAnalysis } from "@/components/DeepNoteAnalysis";

// Mock Data
const trendData = [
  { month: "Jan", rate: 88 },
  { month: "Feb", rate: 89 },
  { month: "Mar", rate: 87 },
  { month: "Apr", rate: 91 },
  { month: "May", rate: 92 },
  { month: "Jun", rate: 90 },
  { month: "Jul", rate: 93 },
  { month: "Aug", rate: 94 },
  { month: "Sep", rate: 92 },
  { month: "Oct", rate: 95 },
  { month: "Nov", rate: 94 },
  { month: "Dec", rate: 96 },
];

const engineerData = [
  { name: "Alex Murphy", firstFix: 42, returnVisits: 8, rate: 84 },
  { name: "Sarah Connor", firstFix: 55, returnVisits: 3, rate: 95 },
  { name: "John Rambo", firstFix: 38, returnVisits: 12, rate: 76 },
  { name: "Ellen Ripley", firstFix: 48, returnVisits: 5, rate: 90 },
  { name: "Tony Stark", firstFix: 60, returnVisits: 2, rate: 97 },
];

const customerData = [
  { name: "Acme Corp", firstFix: 120, returnVisits: 15, rate: 89 },
  { name: "Cyberdyne", firstFix: 85, returnVisits: 25, rate: 77 },
  { name: "Weyland-Yutani", firstFix: 200, returnVisits: 10, rate: 95 },
  { name: "Stark Ind", firstFix: 150, returnVisits: 5, rate: 97 },
  { name: "Umbrella Corp", firstFix: 90, returnVisits: 30, rate: 75 },
];

const assetRepeatData = [
  { assetId: "AST-8821", location: "Acme Corp - Plant Room B", returns15d: 2, returns30d: 3, returns45d: 3, returns60d: 4, status: "Critical" },
  { assetId: "AST-9942", location: "Cyberdyne - Server Hall", returns15d: 1, returns30d: 1, returns45d: 2, returns60d: 2, status: "Warning" },
  { assetId: "AST-7731", location: "Weyland - Med Bay", returns15d: 0, returns30d: 0, returns45d: 1, returns60d: 1, status: "Good" },
  { assetId: "AST-1123", location: "Umbrella - Lab 4", returns15d: 3, returns30d: 4, returns45d: 5, returns60d: 6, status: "Critical" },
  { assetId: "AST-5521", location: "Stark Ind - Workshop", returns15d: 0, returns30d: 1, returns45d: 1, returns60d: 1, status: "Good" },
];

export default function FirstFixAnalysis() {
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'engineer' | 'customer', name: string } | null>(null);

  const totalJobs = engineerData.reduce((acc, curr) => acc + curr.firstFix + curr.returnVisits, 0);
  const totalReturns = engineerData.reduce((acc, curr) => acc + curr.returnVisits, 0);
  const globalRate = Math.round(((totalJobs - totalReturns) / totalJobs) * 100);

  if (selectedEntity) {
    return (
      <AnalyticsLayout 
        title={`${selectedEntity.name} - Performance Detail`}
        description={`Drill-down analysis for ${selectedEntity.type === 'engineer' ? 'Engineer' : 'Customer'}`}
      >
        <Button variant="ghost" onClick={() => setSelectedEntity(null)} className="mb-4 pl-0 hover:pl-2 transition-all">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>
        
        <div className="grid gap-6">
          {/* AI Insights Panel */}
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-indigo-900">AI Root Cause Analysis</CardTitle>
              </div>
              <CardDescription className="text-indigo-700">
                Automated analysis of job notes and return patterns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4 items-start p-4 bg-white/60 rounded-lg border border-indigo-100">
                  <Sparkles className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-indigo-900 text-sm mb-1">Primary Pattern Detected</h4>
                    <p className="text-sm text-indigo-800 leading-relaxed">
                      {selectedEntity.type === 'engineer' 
                        ? "Analysis of 12 return visits suggests a recurring issue with 'Parts Availability'. In 65% of cases, the engineer noted 'Part not on van' for specific boiler models (Worcester Bosch). Recommendation: Review van stock profile for this engineer."
                        : "High frequency of 'No Access' returns (40%) on Monday mornings. Pattern correlates with site manager absence before 10 AM. Recommendation: Schedule visits for this site after 11 AM."
                      }
                    </p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-3 bg-white/60 rounded-lg border border-indigo-100">
                    <span className="text-xs font-medium text-indigo-500 uppercase tracking-wider">Top Factor</span>
                    <div className="text-lg font-bold text-indigo-900 mt-1">
                      {selectedEntity.type === 'engineer' ? "Inventory Gaps" : "Access Restrictions"}
                    </div>
                  </div>
                  <div className="p-3 bg-white/60 rounded-lg border border-indigo-100">
                    <span className="text-xs font-medium text-indigo-500 uppercase tracking-wider">Confidence Score</span>
                    <div className="text-lg font-bold text-indigo-900 mt-1">92% High</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Job History</CardTitle>
                  <CardDescription>List of recent jobs and their first-fix status.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono">JB-9921</TableCell>
                        <TableCell>Today</TableCell>
                        <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge></TableCell>
                        <TableCell>First Fix</TableCell>
                        <TableCell className="text-muted-foreground text-sm">Standard service, no issues.</TableCell>
                      </TableRow>
                      <TableRow className="bg-red-50/30">
                        <TableCell className="font-mono">JB-9918</TableCell>
                        <TableCell>Yesterday</TableCell>
                        <TableCell><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Return Required</Badge></TableCell>
                        <TableCell>Return Visit</TableCell>
                        <TableCell className="text-muted-foreground text-sm">Parts not available on van.</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono">JB-9844</TableCell>
                        <TableCell>3 days ago</TableCell>
                        <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge></TableCell>
                        <TableCell>First Fix</TableCell>
                        <TableCell className="text-muted-foreground text-sm">Customer signed off.</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            
            {/* Deep Note Analysis Sidebar */}
            <div className="md:col-span-1">
              <DeepNoteAnalysis />
            </div>
          </div>
        </div>
      </AnalyticsLayout>
    );
  }

  return (
    <AnalyticsLayout 
      title="First Fix Rate Analysis" 
      description="Track return visits and efficiency by engineer and customer."
    >
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Global First Fix Rate</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalRate}%</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <ArrowUpRight className="h-4 w-4 text-green-500 mr-1" />
              +2.5% from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Return Visits</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReturns}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {totalJobs} total jobs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Cost of Returns</CardTitle>
            <span className="text-muted-foreground font-mono">£</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">£{totalReturns * 150}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on £150 avg. call-out cost
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        {/* Trend Chart - Spans 2 columns */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>12-Month Performance Trend</CardTitle>
            <CardDescription>Global First Fix Rate over the last year.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis domain={[80, 100]} />
                  <Tooltip 
                    cursor={{ stroke: 'rgba(0,0,0,0.1)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cost Calculator - Spans 1 column */}
        <div className="md:col-span-1">
          <CostCalculator />
        </div>
      </div>

      <Tabs defaultValue="engineer" className="space-y-4">
        <TabsList>
          <TabsTrigger value="engineer">
            <Users className="h-4 w-4 mr-2" />
            By Engineer
          </TabsTrigger>
          <TabsTrigger value="customer">
            <Building2 className="h-4 w-4 mr-2" />
            By Customer
          </TabsTrigger>
          <TabsTrigger value="assets">
            <History className="h-4 w-4 mr-2" />
            Asset Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="engineer" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Engineer Efficiency</CardTitle>
                  <CardDescription>Comparison of first-time fixes vs. return visits per engineer.</CardDescription>
                </CardHeader>
                <CardContent className="pl-2">
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={engineerData} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="firstFix" name="First Fix" stackId="a" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="returnVisits" name="Return Visits" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Engineer Performance</CardTitle>
                  <CardDescription>First fix rates by individual engineer.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Engineer</TableHead>
                        <TableHead className="text-right">Total Jobs</TableHead>
                        <TableHead className="text-right">First Fix</TableHead>
                        <TableHead className="text-right">Returns</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {engineerData.map((engineer) => (
                        <TableRow 
                          key={engineer.name} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedEntity({ type: 'engineer', name: engineer.name })}
                        >
                          <TableCell className="font-medium flex items-center gap-2">
                            {engineer.name}
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          </TableCell>
                          <TableCell className="text-right">{engineer.firstFix + engineer.returnVisits}</TableCell>
                          <TableCell className="text-right text-green-600">{engineer.firstFix}</TableCell>
                          <TableCell className="text-right text-red-600">{engineer.returnVisits}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={engineer.rate >= 90 ? "default" : engineer.rate >= 80 ? "secondary" : "destructive"}>
                              {engineer.rate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Coaching Cards Sidebar */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800">Coaching Opportunities</h3>
              </div>
              <CoachingCard 
                engineerName="John Rambo"
                firstFixRate={76}
                topIssues={["Inventory Management", "Incomplete Notes"]}
                recommendation="Assign 'Van Stock Management' module. Review last 3 jobs where 'Parts Missing' was cited."
              />
              <CoachingCard 
                engineerName="Alex Murphy"
                firstFixRate={84}
                topIssues={["Customer Access", "Scheduling"]}
                recommendation="Suggest calling ahead 30 mins prior. Review access protocols for commercial sites."
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="customer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Sites</CardTitle>
              <CardDescription>First fix rates by customer site.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Jobs</TableHead>
                    <TableHead className="text-right">First Fix</TableHead>
                    <TableHead className="text-right">Returns</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerData.map((customer) => (
                    <TableRow 
                      key={customer.name} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntity({ type: 'customer', name: customer.name })}
                    >
                      <TableCell className="font-medium flex items-center gap-2">
                        {customer.name}
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </TableCell>
                      <TableCell className="text-right">{customer.firstFix + customer.returnVisits}</TableCell>
                      <TableCell className="text-right text-green-600">{customer.firstFix}</TableCell>
                      <TableCell className="text-right text-red-600">{customer.returnVisits}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={customer.rate >= 90 ? "default" : customer.rate >= 80 ? "secondary" : "destructive"}>
                          {customer.rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Asset Repeat Visits</CardTitle>
              <CardDescription>Identify assets with frequent return visits within specific time windows.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset ID</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-center">15 Days</TableHead>
                    <TableHead className="text-center">30 Days</TableHead>
                    <TableHead className="text-center">45 Days</TableHead>
                    <TableHead className="text-center">60 Days</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetRepeatData.map((asset) => (
                    <TableRow key={asset.assetId}>
                      <TableCell className="font-mono font-medium">{asset.assetId}</TableCell>
                      <TableCell>{asset.location}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={asset.returns15d > 0 ? "destructive" : "outline"} className={asset.returns15d === 0 ? "text-muted-foreground" : ""}>
                          {asset.returns15d}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={asset.returns30d > 1 ? "destructive" : "outline"} className={asset.returns30d === 0 ? "text-muted-foreground" : ""}>
                          {asset.returns30d}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{asset.returns45d}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{asset.returns60d}</TableCell>
                      <TableCell className="text-right">
                        {asset.status === "Critical" && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Critical
                          </Badge>
                        )}
                        {asset.status === "Warning" && (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                            Warning
                          </Badge>
                        )}
                        {asset.status === "Good" && (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                            Good
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AnalyticsLayout>
  );
}
