import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationSettings } from "@/components/NotificationSettings";
import { EmailTemplateManager } from "@/components/EmailTemplateManager";
import { AIPersonaSettings } from "@/components/AIPersonaSettings";
import { ProcessingSettings } from "@/components/ProcessingSettings";
import { 
  Bell, 
  Mail, 
  Shield, 
  UserCog, 
  Palette, 
  Globe,
  BrainCircuit,
  Moon,
  Sun,
  Database,
  Cpu
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/ThemeContext";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="pb-6 border-b border-border/50">
        <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">System Settings</h1>
        <p className="text-muted-foreground mt-2 text-lg">Manage platform configuration, notifications, and templates.</p>
      </div>

      <Tabs defaultValue="notifications" className="w-full">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar Navigation for Settings */}
          <aside className="w-full md:w-64 shrink-0">
            <TabsList className="flex flex-col h-auto w-full bg-transparent p-0 gap-1.5">
              <TabsTrigger 
                value="notifications" 
                className="w-full justify-start px-4 py-2.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:bg-muted/50"
              >
                <Bell className="w-4 h-4 mr-3" />
                Notifications
              </TabsTrigger>
              <TabsTrigger 
                value="email-templates" 
                className="w-full justify-start px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email Templates
              </TabsTrigger>
              <TabsTrigger 
                value="ai-persona" 
                className="w-full justify-start px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
              >
                <BrainCircuit className="w-4 h-4 mr-2" />
                AI Auditor Persona
              </TabsTrigger>
              <TabsTrigger 
                value="general" 
                className="w-full justify-start px-4 py-2.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:bg-muted/50"
              >
                <Globe className="w-4 h-4 mr-3" />
                General
              </TabsTrigger>
              <TabsTrigger 
                value="appearance" 
                className="w-full justify-start px-4 py-2.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:bg-muted/50"
              >
                <Palette className="w-4 h-4 mr-3" />
                Appearance
              </TabsTrigger>
              <TabsTrigger 
                value="processing" 
                className="w-full justify-start px-4 py-2.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:bg-muted/50"
              >
                <Cpu className="w-4 h-4 mr-3" />
                Processing
              </TabsTrigger>
              <TabsTrigger 
                value="security" 
                className="w-full justify-start px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
              >
                <Shield className="w-4 h-4 mr-2" />
                Security
              </TabsTrigger>
            </TabsList>
          </aside>

          {/* Content Area */}
          <div className="flex-1">
            <TabsContent value="notifications" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Notification Preferences</h2>
                <p className="text-sm text-muted-foreground">Configure how and when you receive system alerts.</p>
              </div>
              <NotificationSettings />
            </TabsContent>

            <TabsContent value="email-templates" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Email Template Manager</h2>
                <p className="text-sm text-muted-foreground">Customize automated email content and AI generation rules.</p>
              </div>
              <EmailTemplateManager />
            </TabsContent>

            <TabsContent value="ai-persona" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-lg font-medium">AI Auditor Configuration</h2>
                <p className="text-sm text-muted-foreground">Configure the behavior, tone, and strictness of the AI analysis engine.</p>
              </div>
              <AIPersonaSettings />
            </TabsContent>

            <TabsContent value="appearance" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Appearance Settings</CardTitle>
                  <CardDescription>Customize the look and feel of the application.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-0.5">
                      <Label className="text-base">Dark Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Switch between light and dark themes.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-muted-foreground" />
                      <Switch 
                        checked={theme === 'dark'} 
                        onCheckedChange={toggleTheme}
                      />
                      <Moon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="general" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Information</CardTitle>
                  <CardDescription>General settings for the Job Sheet QA instance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="site-name">Instance Name</Label>
                    <Input id="site-name" defaultValue="Job Sheet QA - Production" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="support-email">Support Email</Label>
                    <Input id="support-email" defaultValue="support@jobsheetqa.com" />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-0.5">
                      <Label>Maintenance Mode</Label>
                      <p className="text-sm text-muted-foreground">Disable access for non-admin users.</p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Demo Data Management
                  </CardTitle>
                  <CardDescription>Manage the sample data used in this demo environment.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Reset Demo Data</Label>
                      <p className="text-sm text-muted-foreground">
                        Clear all local changes and restore the original "Gold Standard" dataset. 
                        Useful if you want to restart the demo experience.
                      </p>
                    </div>
                    <Button 
                      variant="destructive" 
                      onClick={() => {
                        if (confirm("Are you sure? This will reload the page and reset all data.")) {
                          localStorage.clear();
                          window.location.reload();
                        }
                      }}
                    >
                      Reset Data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="processing" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Document Processing Settings</h2>
                <p className="text-sm text-muted-foreground">Configure extraction strategies, AI fallback, and performance options.</p>
              </div>
              <ProcessingSettings />
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Security Policies</CardTitle>
                  <CardDescription>Manage access controls and session policies.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-0.5">
                      <Label>Enforce 2FA</Label>
                      <p className="text-sm text-muted-foreground">Require two-factor authentication for all admin users.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-0.5">
                      <Label>Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">Automatically log out inactive users after 30 minutes.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="pt-4">
                    <Button variant="outline" className="text-destructive hover:text-destructive">
                      Reset All Security Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
