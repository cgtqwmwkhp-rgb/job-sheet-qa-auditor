import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  LogOut, 
  ChevronRight, 
  TrendingUp,
  FileText,
  Calendar,
  Bell,
  MessageSquareWarning,
  Settings
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { NotificationSettings } from "@/components/NotificationSettings";

export default function TechnicianDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const { fcmToken } = usePushNotifications();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

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
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {fcmToken && <span className="absolute top-2 right-2 h-2 w-2 bg-green-500 rounded-full" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
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
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="audits">Recent Audits</TabsTrigger>
            <TabsTrigger value="defects">My Defects</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
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
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
                    View Evidence
                  </Button>
                  <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="flex-1 h-8 text-xs">
                        <MessageSquareWarning className="w-3 h-3 mr-1" />
                        Dispute
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Dispute Finding</DialogTitle>
                        <DialogDescription>
                          Provide a reason why this finding is incorrect. This will be sent to the QA Lead for review.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="reason">Reason for Dispute</Label>
                          <Textarea 
                            id="reason" 
                            placeholder="e.g., The signature is present on page 3, top right corner." 
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDisputeOpen(false)}>Cancel</Button>
                        <Button onClick={() => {
                          setDisputeOpen(false);
                          setDisputeReason("");
                          // TODO: Submit dispute API call
                        }}>Submit Dispute</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
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

          <TabsContent value="settings" className="space-y-3">
            <NotificationSettings />
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  App Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Dark Mode</span>
                    <span className="text-xs text-muted-foreground">Adjust app appearance</span>
                  </div>
                  <Switch disabled />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Offline Mode</span>
                    <span className="text-xs text-muted-foreground">Cache data for field use</span>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="pt-4 border-t">
                  <Button variant="destructive" className="w-full" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </CardContent>
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
