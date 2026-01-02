import { useNotificationSettings, useUpdateNotificationSettings, type NotificationSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export function NotificationSettings() {
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleToggle = (key: keyof NotificationSettings) => {
    if (!localSettings) return;
    
    const newSettings = { ...localSettings, [key]: !localSettings[key] };
    setLocalSettings(newSettings);
    
    updateSettings.mutate(newSettings, {
      onSuccess: () => {
        toast.success("Notification preferences updated");
      },
      onError: () => {
        toast.error("Failed to update preferences");
        // Revert on error
        setLocalSettings(localSettings);
      }
    });
  };

  if (isLoading || !localSettings) {
    return <div className="p-4 text-center text-muted-foreground">Loading settings...</div>;
  }

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
    </Card>
  );
}
