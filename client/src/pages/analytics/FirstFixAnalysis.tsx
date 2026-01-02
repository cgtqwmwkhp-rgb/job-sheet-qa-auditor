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
  PieChart,
  Pie,
  Cell
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
import { ArrowDownRight, ArrowUpRight, Wrench, Users, Building2 } from "lucide-react";

// Mock Data
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

const COLORS = ['#22c55e', '#ef4444'];

export default function FirstFixAnalysis() {
  const totalJobs = engineerData.reduce((acc, curr) => acc + curr.firstFix + curr.returnVisits, 0);
  const totalReturns = engineerData.reduce((acc, curr) => acc + curr.returnVisits, 0);
  const globalRate = Math.round(((totalJobs - totalReturns) / totalJobs) * 100);

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
        </TabsList>

        <TabsContent value="engineer" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="col-span-2">
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
                      <Tooltip 
                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Legend />
                      <Bar dataKey="firstFix" name="First Fix" stackId="a" fill="#22c55e" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="returnVisits" name="Return Visit" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Detailed Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Engineer</TableHead>
                      <TableHead className="text-right">Total Jobs</TableHead>
                      <TableHead className="text-right">First Fixes</TableHead>
                      <TableHead className="text-right">Return Visits</TableHead>
                      <TableHead className="text-right">Success Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {engineerData.sort((a, b) => b.rate - a.rate).map((engineer) => (
                      <TableRow key={engineer.name}>
                        <TableCell className="font-medium">{engineer.name}</TableCell>
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
        </TabsContent>

        <TabsContent value="customer" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Customer Site Reliability</CardTitle>
                <CardDescription>Return visit volume by customer account.</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={customerData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip 
                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Legend />
                      <Bar dataKey="firstFix" name="First Fix" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="returnVisits" name="Return Visit" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Detailed Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total Jobs</TableHead>
                      <TableHead className="text-right">First Fixes</TableHead>
                      <TableHead className="text-right">Return Visits</TableHead>
                      <TableHead className="text-right">Success Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.sort((a, b) => a.rate - b.rate).map((customer) => (
                      <TableRow key={customer.name}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
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
          </div>
        </TabsContent>
      </Tabs>
    </AnalyticsLayout>
  );
}
