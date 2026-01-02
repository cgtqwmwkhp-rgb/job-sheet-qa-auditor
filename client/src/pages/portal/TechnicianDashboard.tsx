import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  LogOut, 
  ChevronRight, 
  TrendingUp,
  FileText,
  Calendar
} from "lucide-react";

export default function TechnicianDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  const handleLogout = () => {
    setLocation("/portal/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Mobile Header */}
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight">Technician Portal</h1>
            <p className="text-[10px] text-muted-foreground">Logged in as Alex M.</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-5 w-5 text-muted-foreground" />
        </Button>
      </header>

      <div className="p-4 space-y-4">
        {/* Scorecard */}
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-primary-foreground/80 text-sm font-medium">Current Quality Score</p>
                <h2 className="text-4xl font-bold mt-1">94.2%</h2>
              </div>
              <Badge className="bg-white/20 hover:bg-white/30 text-white border-none">
                Top 10%
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs opacity-90">
                <span>Monthly Target: 95%</span>
                <span>-0.8%</span>
              </div>
              <Progress value={94.2} className="h-2 bg-black/20 [&>div]:bg-white" />
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-2xl font-bold">128</span>
              <span className="text-xs text-muted-foreground">Passed Audits</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-2xl font-bold">7</span>
              <span className="text-xs text-muted-foreground">Defects Found</span>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Tabs */}
        <Tabs defaultValue="audits" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="audits">Recent Audits</TabsTrigger>
            <TabsTrigger value="defects">My Defects</TabsTrigger>
          </TabsList>
          
          <TabsContent value="audits" className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="flex items-center p-3 gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${i === 2 ? 'bg-amber-100' : 'bg-green-100'}`}>
                    {i === 2 ? (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="font-semibold text-sm truncate">Job #4928-{i}</h4>
                      <span className="text-[10px] text-muted-foreground">2h ago</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">Site: London Data Center</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </TabsContent>
          
          <TabsContent value="defects" className="space-y-3">
            <Card className="border-l-4 border-l-red-500">
              <div className="p-3">
                <div className="flex justify-between mb-1">
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Critical</Badge>
                  <span className="text-[10px] text-muted-foreground">Yesterday</span>
                </div>
                <h4 className="font-semibold text-sm mb-1">Missing Safety Signature</h4>
                <p className="text-xs text-muted-foreground">Job #4821-9 • Reviewer: Sarah C.</p>
                <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs">
                  View Evidence
                </Button>
              </div>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <div className="p-3">
                <div className="flex justify-between mb-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800">Warning</Badge>
                  <span className="text-[10px] text-muted-foreground">3 days ago</span>
                </div>
                <h4 className="font-semibold text-sm mb-1">Blurry Serial Number</h4>
                <p className="text-xs text-muted-foreground">Job #4792-3 • Reviewer: Auto-AI</p>
                <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs">
                  View Evidence
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2 px-2 z-10 safe-area-pb">
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto py-2 px-4 text-primary">
          <TrendingUp className="h-5 w-5" />
          <span className="text-[10px] font-medium">Dashboard</span>
        </Button>
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto py-2 px-4 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="text-[10px] font-medium">My Jobs</span>
        </Button>
        <Button variant="ghost" className="flex flex-col items-center gap-1 h-auto py-2 px-4 text-muted-foreground">
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-medium">History</span>
        </Button>
      </div>
    </div>
  );
}
