import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail,
  PenTool,
} from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmailTemplateManager } from "@/components/EmailTemplateManager";

/** Illustrative defaults only — no notification / FCM / email prefs API. */
const PREVIEW_DEFAULTS = {
  criticalDefects: true,
  majorDefects: true,
  minorDefects: false,
  auditCompleted: true,
  dailySummary: false,
} as const;

export function NotificationSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
          <Badge variant="secondary">Preview — not saved</Badge>
        </CardTitle>
        <CardDescription>
          Shows the intended alert categories. Toggles are disabled until a
          notification delivery API exists — changes would not reach email or
          push today.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription>
            Preview layout only. Preferences are not persisted and do not
            control live alerts.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Defect Alerts
          </h3>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="critical" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Critical Defects
              </Label>
              <span className="text-xs text-muted-foreground">
                Immediate alerts for safety and compliance failures.
              </span>
            </div>
            <Switch
              id="critical"
              checked={PREVIEW_DEFAULTS.criticalDefects}
              disabled
              aria-label="Critical defects (preview only)"
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="major" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Major Defects
              </Label>
              <span className="text-xs text-muted-foreground">
                Alerts for significant quality issues requiring rework.
              </span>
            </div>
            <Switch
              id="major"
              checked={PREVIEW_DEFAULTS.majorDefects}
              disabled
              aria-label="Major defects (preview only)"
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label htmlFor="minor" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-500" />
                Minor Defects
              </Label>
              <span className="text-xs text-muted-foreground">
                Notifications for minor cosmetic or documentation issues.
              </span>
            </div>
            <Switch
              id="minor"
              checked={PREVIEW_DEFAULTS.minorDefects}
              disabled
              aria-label="Minor defects (preview only)"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            General Updates
          </h3>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label
                htmlFor="audit-complete"
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Audit Completed
              </Label>
              <span className="text-xs text-muted-foreground">
                Get notified when a job sheet audit is finalized.
              </span>
            </div>
            <Switch
              id="audit-complete"
              checked={PREVIEW_DEFAULTS.auditCompleted}
              disabled
              aria-label="Audit completed (preview only)"
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex flex-col space-y-1">
              <Label
                htmlFor="daily-summary"
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4 text-slate-500" />
                Daily Summary
              </Label>
              <span className="text-xs text-muted-foreground">
                Receive a daily digest of your performance stats.
              </span>
            </div>
            <Switch
              id="daily-summary"
              checked={PREVIEW_DEFAULTS.dailySummary}
              disabled
              aria-label="Daily summary (preview only)"
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/20 border-t p-4 flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled
          title="Test email is not wired — no message would be sent"
        >
          <Mail className="h-4 w-4 mr-2" />
          Send Test Summary Email (not wired)
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
            >
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
