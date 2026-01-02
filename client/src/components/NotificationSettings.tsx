import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, CheckCircle2, FileText, Mail, PenTool } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmailTemplateManager } from "@/components/EmailTemplateManager";

interface NotificationSettingsState {
  criticalDefects: boolean;
  majorDefects: boolean;
  minorDefects: boolean;
  auditCompleted: boolean;
  dailySummary: boolean;
}

export function NotificationSettings() {
  // Local state for notification settings (would be persisted to backend in real app)
  const [localSettings, setLocalSettings] = useState<NotificationSettingsState>({
    criticalDefects: true,
    majorDefects: true,
    minorDefects: false,
    auditCompleted: true,
    dailySummary: false,
  });
  const [isSending, setIsSending] = useState(false);

  const handleToggle = (key: keyof NotificationSettingsState) => {
    const newSettings = { ...localSettings, [key]: !localSettings[key] };
    setLocalSettings(newSettings);
    toast.success("Notification preferences updated");
  };

  const handleSendTestEmail = async () => {
    setIsSending(true);
    try {
      // Simulate sending test email
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Test email sent! Check your inbox.");
    } catch {
      toast.error("Failed to send test email");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Manage which alerts you receive on your device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Defect Alerts</h3>
          
          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="critical" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Critical Defects
              </Label>
              <span className="text-xs text-muted-foreground">Immediate alerts for safety and compliance failures.</span>
            </div>
            <Switch 
              id="critical" 
              checked={localSettings.criticalDefects}
              onCheckedChange={() => handleToggle("criticalDefects")}
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="major" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Major Defects
              </Label>
              <span className="text-xs text-muted-foreground">Alerts for significant quality issues requiring rework.</span>
            </div>
            <Switch 
              id="major" 
              checked={localSettings.majorDefects}
              onCheckedChange={() => handleToggle("majorDefects")}
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="minor" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-500" />
                Minor Defects
              </Label>
              <span className="text-xs text-muted-foreground">Notifications for minor cosmetic or documentation issues.</span>
            </div>
            <Switch 
              id="minor" 
              checked={localSettings.minorDefects}
              onCheckedChange={() => handleToggle("minorDefects")}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">General Updates</h3>
          
          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="audit-complete" className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Audit Completed
              </Label>
              <span className="text-xs text-muted-foreground">Get notified when a job sheet audit is finalized.</span>
            </div>
            <Switch 
              id="audit-complete" 
              checked={localSettings.auditCompleted}
              onCheckedChange={() => handleToggle("auditCompleted")}
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="daily-summary" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                Daily Summary
              </Label>
              <span className="text-xs text-muted-foreground">Receive a daily digest of your performance stats.</span>
            </div>
            <Switch 
              id="daily-summary" 
              checked={localSettings.dailySummary}
              onCheckedChange={() => handleToggle("dailySummary")}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/20 border-t p-4 flex flex-col gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full" 
          onClick={handleSendTestEmail}
          disabled={!localSettings.dailySummary || isSending}
        >
          <Mail className="h-4 w-4 mr-2" />
          {isSending ? "Sending..." : "Send Test Summary Email"}
        </Button>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              <PenTool className="h-3 w-3 mr-2" />
              Customize Email Templates
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden">
            <div className="h-full overflow-auto p-6">
              <EmailTemplateManager />
            </div>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
