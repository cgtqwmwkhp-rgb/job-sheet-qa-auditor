import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Search, Trophy, AlertCircle, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Mock Data
const technicians = [
  { id: 1, name: "John Doe", audits: 145, passRate: 98, trend: "+2%", status: "Top Performer", avatar: "JD" },
  { id: 2, name: "Sarah Smith", audits: 132, passRate: 96, trend: "+1%", status: "Excellent", avatar: "SS" },
  { id: 3, name: "Mike Johnson", audits: 156, passRate: 92, trend: "-3%", status: "Needs Review", avatar: "MJ" },
  { id: 4, name: "Emily Davis", audits: 98, passRate: 88, trend: "-5%", status: "At Risk", avatar: "ED" },
  { id: 5, name: "Alex Wilson", audits: 112, passRate: 95, trend: "+4%", status: "Improving", avatar: "AW" },
];

export default function TechnicianPerformance() {
  return (
    <AnalyticsLayout 
      title="Technician Performance" 
      description="Individual scorecards, leaderboards, and training needs analysis."
    >
      <div className="space-y-6">
        {/* Leaderboard Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-gradient-to-br from-yellow-50 to-white border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-yellow-700">
                <Trophy className="w-5 h-5" />
                Top Performer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-yellow-400">
                  <AvatarFallback className="bg-yellow-100 text-yellow-700 font-bold text-xl">JD</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg">John Doe</h3>
                  <p className="text-sm text-muted-foreground">98% Pass Rate</p>
                  <Badge variant="outline" className="mt-1 bg-yellow-100 text-yellow-800 border-yellow-200">
                    145 Audits
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-red-400">
                  <AvatarFallback className="bg-red-100 text-red-700 font-bold text-xl">ED</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg">Emily Davis</h3>
                  <p className="text-sm text-muted-foreground">88% Pass Rate</p>
                  <Badge variant="outline" className="mt-1 bg-red-100 text-red-800 border-red-200">
                    Training Required
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-700">
                <TrendingUp className="w-5 h-5" />
                Most Improved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-green-400">
                  <AvatarFallback className="bg-green-100 text-green-700 font-bold text-xl">AW</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg">Alex Wilson</h3>
                  <p className="text-sm text-muted-foreground">+4% vs Last Month</p>
                  <Badge variant="outline" className="mt-1 bg-green-100 text-green-800 border-green-200">
                    Rising Star
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Technician Roster</CardTitle>
                <CardDescription>Detailed performance metrics for all active staff.</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search technicians..." className="pl-8" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Total Audits</TableHead>
                  <TableHead>Pass Rate</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((tech) => (
                  <TableRow key={tech.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{tech.avatar}</AvatarFallback>
                        </Avatar>
                        {tech.name}
                      </div>
                    </TableCell>
                    <TableCell>{tech.audits}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={tech.passRate} className="w-16 h-2" />
                        <span className="font-bold">{tech.passRate}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={tech.trend.startsWith("+") ? "text-green-600" : "text-red-600"}>
                        {tech.trend}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        tech.status === "Top Performer" ? "default" : 
                        tech.status === "At Risk" ? "destructive" : "secondary"
                      }>
                        {tech.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">View Profile</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AnalyticsLayout>
  );
}
