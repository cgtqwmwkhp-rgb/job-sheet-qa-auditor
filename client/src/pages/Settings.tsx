import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationSettings } from "@/components/NotificationSettings";
import { EmailTemplateManager } from "@/components/EmailTemplateManager";
import { AIPersonaSettings } from "@/components/AIPersonaSettings";
import { ProcessingSettings } from "@/components/ProcessingSettings";
import { AuditPolicySettings } from "@/components/AuditPolicySettings";
import { ApiCostSettings } from "@/components/ApiCostSettings";
import {
  Bell,
  Mail,
  Shield,
  Palette,
  Globe,
  BrainCircuit,
  Moon,
  Sun,
  Database,
  Cpu,
  ShieldAlert,
  DollarSign,
  ArrowLeft,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useSearch } from "wouter";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

const SETTINGS_TABS = [
  "notifications",
  "email-templates",
  "ai-persona",
  "processing",
  "audit-policy",
  "general",
  "appearance",
  "security",
  "api-costs",
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const settingsNavTriggerClass =
  "w-auto shrink-0 md:w-full justify-start gap-3 whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-muted/50";

function SettingsNavSection({ label }: { label: string }) {
  return (
    <div className="hidden pt-4 pb-1.5 px-4 first:pt-0 md:block">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/** Deep-linkable tab: `/settings?tab=api-costs` opens straight on a section —
 * one click from anywhere in the app instead of landing on Notifications first. */
function useSettingsTabFromUrl(canViewApiCosts: boolean) {
  const search = useSearch();
  const initialTab = useMemo<SettingsTab>(() => {
    const requested = new URLSearchParams(search).get("tab");
    if (
      requested &&
      (SETTINGS_TABS as readonly string[]).includes(requested) &&
      (requested !== "api-costs" || canViewApiCosts)
    ) {
      return requested as SettingsTab;
    }
    return "notifications";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount
  }, []);
  const [tab, setTabState] = useState<SettingsTab>(initialTab);

  const setTab = (value: string) => {
    setTabState(value as SettingsTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url.toString());
  };

  return [tab, setTab] as const;
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  // Settings is already admin/qa_lead gated; cost tracking is visible to both.
  const { hasRole } = useAuth();
  const canViewApiCosts = hasRole(["admin", "qa_lead"]);
  const [activeTab, setActiveTab] = useSettingsTabFromUrl(canViewApiCosts);
  const { data: version } = trpc.system.version.useQuery();
  const isProdEnvironment = version?.environment === "production";

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="pb-6 border-b border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            System Settings
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Manage platform configuration, notifications, and templates.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col gap-4 md:flex-row md:gap-8">
            <aside className="w-full shrink-0 md:w-64 md:sticky md:top-6 md:self-start">
              <TabsList className="flex h-auto w-full flex-row gap-1 overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-1.5 md:flex-col md:gap-0.5 md:overflow-visible md:p-2">
                <SettingsNavSection label="Communications" />
                <TabsTrigger
                  value="notifications"
                  className={settingsNavTriggerClass}
                >
                  <Bell className="w-4 h-4 shrink-0" />
                  Notifications
                </TabsTrigger>
                <TabsTrigger
                  value="email-templates"
                  className={settingsNavTriggerClass}
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  Email Templates
                </TabsTrigger>

                <SettingsNavSection label="AI & Auditing" />
                <TabsTrigger
                  value="ai-persona"
                  className={settingsNavTriggerClass}
                >
                  <BrainCircuit className="w-4 h-4 shrink-0" />
                  AI Auditor Persona
                </TabsTrigger>
                <TabsTrigger
                  value="processing"
                  className={settingsNavTriggerClass}
                >
                  <Cpu className="w-4 h-4 shrink-0" />
                  Processing
                </TabsTrigger>
                <TabsTrigger
                  value="audit-policy"
                  className={settingsNavTriggerClass}
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Audit Policy
                </TabsTrigger>

                <SettingsNavSection label="Platform" />
                <TabsTrigger
                  value="general"
                  className={settingsNavTriggerClass}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  General
                </TabsTrigger>
                <TabsTrigger
                  value="appearance"
                  className={settingsNavTriggerClass}
                >
                  <Palette className="w-4 h-4 shrink-0" />
                  Appearance
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  className={settingsNavTriggerClass}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  Security
                </TabsTrigger>

                {canViewApiCosts ? (
                  <>
                    <div className="mx-2 my-2 hidden border-t border-border/60 md:block" />
                    <div className="hidden rounded-md border border-primary/15 bg-primary/5 px-4 py-2 md:block">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                        FinOps
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        API spend &amp; budgets
                      </p>
                    </div>
                    <TabsTrigger
                      value="api-costs"
                      className={`${settingsNavTriggerClass} md:mt-1`}
                    >
                      <DollarSign className="w-4 h-4 shrink-0" />
                      API Costs
                    </TabsTrigger>
                  </>
                ) : null}
              </TabsList>
            </aside>

            <div className="flex-1">
              <TabsContent value="notifications" className="mt-0 space-y-6">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">
                      Notification Preferences
                    </h2>
                    <Badge variant="secondary">Preview</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Layout preview only — alert delivery is not configured yet
                    and preferences are not saved.
                  </p>
                </div>
                <NotificationSettings />
              </TabsContent>

              <TabsContent value="email-templates" className="mt-0 space-y-6">
                <div className="mb-4">
                  <h2 className="text-lg font-medium">
                    Email Template Manager
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Customize automated email content and AI generation rules.
                  </p>
                </div>
                <EmailTemplateManager />
              </TabsContent>

              <TabsContent value="ai-persona" className="mt-0 space-y-6">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">
                      AI Auditor Configuration
                    </h2>
                    <Badge variant="outline">Live</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Org advisory voice for sufficiency, Deep Note, and coaching.
                    Fail Majors/Minors remain under Audit Policy — separate tab.
                  </p>
                </div>
                <AIPersonaSettings />
              </TabsContent>

              <TabsContent value="appearance" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance Settings</CardTitle>
                    <CardDescription>
                      Customize the look and feel of the application.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="dark-mode-toggle" className="text-base">
                          Dark Mode
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Switch between light and dark themes. Preference is
                          saved for this browser.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sun
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Switch
                          id="dark-mode-toggle"
                          checked={theme === "dark"}
                          onCheckedChange={checked =>
                            setTheme(checked ? "dark" : "light")
                          }
                        />
                        <Moon
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="general" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>General Settings</CardTitle>
                      <Badge variant="secondary">Preview — not saved</Badge>
                    </div>
                    <CardDescription>
                      Display-only placeholders. Instance name, support email,
                      and maintenance mode are not wired to a backend.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <AlertDescription>
                        These fields do not change production configuration.
                      </AlertDescription>
                    </Alert>
                    <div className="grid gap-2">
                      <Label htmlFor="site-name">Instance Name</Label>
                      <Input
                        id="site-name"
                        defaultValue="Job Sheet QA"
                        readOnly
                        disabled
                        aria-describedby="site-name-hint"
                      />
                      <p
                        id="site-name-hint"
                        className="text-xs text-muted-foreground"
                      >
                        Not editable — no settings API for instance branding.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="support-email">Support Email</Label>
                      <Input
                        id="support-email"
                        defaultValue="support@jobsheetqa.com"
                        readOnly
                        disabled
                        aria-describedby="support-email-hint"
                      />
                      <p
                        id="support-email-hint"
                        className="text-xs text-muted-foreground"
                      >
                        Placeholder only — not used for outbound mail.
                      </p>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="maintenance-mode">
                          Maintenance Mode
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Would disable access for non-admin users when
                          implemented. Not enforced today.
                        </p>
                      </div>
                      <Switch
                        id="maintenance-mode"
                        disabled
                        checked={false}
                        aria-label="Maintenance mode (not available)"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Browser Data Reset
                    </CardTitle>
                    <CardDescription>
                      Clears this browser&apos;s localStorage only — does not
                      reset server or shared demo data. Disabled in production.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label>Clear local browser storage</Label>
                        <p className="text-sm text-muted-foreground">
                          {isProdEnvironment
                            ? "Not available in production — localStorage reset is a non-prod control."
                            : "Removes locally cached preferences and client state, then reloads the page."}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        disabled={isProdEnvironment}
                        onClick={() => {
                          if (isProdEnvironment) return;
                          if (
                            confirm(
                              "Clear this browser's localStorage and reload? Server data is unaffected."
                            )
                          ) {
                            localStorage.clear();
                            window.location.reload();
                          }
                        }}
                      >
                        Clear localStorage
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="processing" className="mt-0 space-y-6">
                <div className="mb-4">
                  <h2 className="text-lg font-medium">
                    Document Processing Settings
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Configure extraction strategies, AI fallback, and
                    performance options.
                  </p>
                </div>
                <ProcessingSettings />
              </TabsContent>

              <TabsContent value="audit-policy" className="mt-0 space-y-6">
                <div className="mb-4">
                  <h2 className="text-lg font-medium">Audit Policy</h2>
                  <p className="text-sm text-muted-foreground">
                    Major fail hard-fails the job card. Minor fail only affects
                    Doc Quality %. Editable without a deploy.
                  </p>
                </div>
                <AuditPolicySettings />
              </TabsContent>

              <TabsContent value="security" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>Security Policies</CardTitle>
                      <Badge variant="secondary">Preview — not enforced</Badge>
                    </div>
                    <CardDescription>
                      Policy toggles below are illustrative only. They do not
                      change authentication or session behaviour.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <AlertDescription>
                        No security-policy API is connected — switches are
                        disabled so they cannot imply a live effect.
                      </AlertDescription>
                    </Alert>
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="enforce-2fa">Enforce 2FA</Label>
                        <p className="text-sm text-muted-foreground">
                          Would require two-factor authentication for admin
                          users when implemented.
                        </p>
                      </div>
                      <Switch
                        id="enforce-2fa"
                        disabled
                        checked={false}
                        aria-label="Enforce 2FA (not available)"
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="session-timeout">Session Timeout</Label>
                        <p className="text-sm text-muted-foreground">
                          Would log out inactive users after a timeout when
                          implemented. Session length is controlled by auth
                          today, not this switch.
                        </p>
                      </div>
                      <Switch
                        id="session-timeout"
                        disabled
                        checked={false}
                        aria-label="Session timeout (not available)"
                      />
                    </div>
                    <div className="pt-4">
                      <Button
                        variant="outline"
                        className="text-muted-foreground"
                        disabled
                        title="Not available — no security settings API"
                      >
                        Reset All Security Settings
                      </Button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Reset is unavailable until policies can be persisted.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {canViewApiCosts ? (
                <TabsContent value="api-costs" className="mt-0 space-y-6">
                  <ApiCostSettings />
                </TabsContent>
              ) : null}
            </div>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
