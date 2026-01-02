import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Mail, 
  Sparkles, 
  Eye, 
  Send, 
  RefreshCw, 
  CheckCircle2,
  User,
  Users
} from "lucide-react";
import { toast } from "sonner";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  description: string;
  aiPrompt: string;
  targetAudience: "stakeholders" | "engineers";
  frequency: "daily" | "weekly";
  isActive: boolean;
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "daily-summary",
    name: "Daily Stakeholder Summary",
    subject: "Job Sheet QA - Daily Performance Digest",
    description: "High-level overview of daily audit performance, critical defects, and hold queue status.",
    aiPrompt: "Generate a professional daily summary email for stakeholders. Include: Total audits processed, pass rate trend, top 3 critical defects found today, and current hold queue volume. Tone: Professional, concise, data-driven.",
    targetAudience: "stakeholders",
    frequency: "daily",
    isActive: true
  },
  {
    id: "weekly-engineer",
    name: "Weekly Engineer Performance",
    subject: "Your Weekly Quality Scorecard",
    description: "Personalized performance report for each engineer with scores, trends, and improvement tips.",
    aiPrompt: "Generate a personalized weekly email for an engineer. Include: Their personal pass rate vs team average, list of their most common defect types this week, and one specific actionable tip for improvement. Tone: Encouraging, constructive, coaching-oriented.",
    targetAudience: "engineers",
    frequency: "weekly",
    isActive: true
  }
];

export function EmailTemplateManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const handleUpdateTemplate = (key: keyof EmailTemplate, value: any) => {
    setTemplates(prev => prev.map(t => 
      t.id === selectedTemplateId ? { ...t, [key]: value } : t
    ));
  };

  const generatePreview = () => {
    setIsGenerating(true);
    setPreviewContent(null);

    // Simulate AI generation delay
    setTimeout(() => {
      const mockContent = selectedTemplate.id === "daily-summary" 
        ? `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #0f172a; padding: 20px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0;">Daily Performance Digest</h2>
              <p style="color: #94a3b8; margin: 5px 0 0;">${new Date().toLocaleDateString()}</p>
            </div>
            <div style="padding: 24px; background-color: #ffffff;">
              <p>Dear Stakeholders,</p>
              <p>Here is the summary of today's Job Sheet QA performance:</p>
              
              <div style="display: flex; gap: 16px; margin: 24px 0;">
                <div style="flex: 1; background: #f8fafc; padding: 16px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 24px; font-weight: bold; color: #0f172a;">142</div>
                  <div style="font-size: 12px; color: #64748b;">Audits Processed</div>
                </div>
                <div style="flex: 1; background: #f0fdf4; padding: 16px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 24px; font-weight: bold; color: #16a34a;">94.2%</div>
                  <div style="font-size: 12px; color: #64748b;">Pass Rate</div>
                </div>
                <div style="flex: 1; background: #fef2f2; padding: 16px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 24px; font-weight: bold; color: #dc2626;">3</div>
                  <div style="font-size: 12px; color: #64748b;">Critical Defects</div>
                </div>
              </div>

              <h3 style="font-size: 16px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Top Critical Defects</h3>
              <ul style="color: #475569; padding-left: 20px;">
                <li>Missing Customer Signature (2 occurrences)</li>
                <li>Incorrect Serial Number Photo (1 occurrence)</li>
              </ul>

              <div style="margin-top: 24px; padding: 16px; background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 4px;">
                <strong>Hold Queue Status:</strong> 12 items pending review. <a href="#" style="color: #ea580c;">View Queue &rarr;</a>
              </div>
            </div>
            <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
              &copy; 2024 Job Sheet QA Auditor. Automated Report.
            </div>
          </div>
        `
        : `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #2563eb; padding: 20px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0;">Weekly Scorecard</h2>
              <p style="color: #bfdbfe; margin: 5px 0 0;">Week of ${new Date().toLocaleDateString()}</p>
            </div>
            <div style="padding: 24px; background-color: #ffffff;">
              <p>Hi Alex,</p>
              <p>Great work this week! Here's how you performed compared to the team average.</p>
              
              <div style="margin: 24px 0; padding: 20px; background: #eff6ff; border-radius: 12px; text-align: center;">
                <div style="font-size: 14px; color: #1e40af; margin-bottom: 8px;">Your Pass Rate</div>
                <div style="font-size: 48px; font-weight: bold; color: #1d4ed8;">98.5%</div>
                <div style="font-size: 14px; color: #1e40af; margin-top: 4px;">Team Avg: 94.2%</div>
              </div>

              <h3 style="font-size: 16px; color: #334155;">Focus Area for Next Week</h3>
              <p style="color: #475569; line-height: 1.5;">
                We noticed 2 instances of <strong>"Blurry Photos"</strong> this week. 
                <br/><br/>
                <em>Tip: Try tapping the screen to focus before capturing, especially in low-light environments.</em>
              </p>

              <div style="margin-top: 24px; text-align: center;">
                <a href="#" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Full Report</a>
              </div>
            </div>
            <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
              &copy; 2024 Job Sheet QA Auditor. Automated Report.
            </div>
          </div>
        `;
      
      setPreviewContent(mockContent);
      setIsGenerating(false);
      toast.success("AI Preview Generated");
    }, 1500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
      {/* Sidebar List */}
      <div className="lg:col-span-3 space-y-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg">Templates</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-2">
              {templates.map(template => (
                <div 
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setPreviewContent(null);
                  }}
                  className={`p-3 rounded-md cursor-pointer transition-colors border ${
                    selectedTemplateId === template.id 
                      ? "bg-primary/10 border-primary" 
                      : "hover:bg-muted border-transparent"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm">{template.name}</span>
                    {template.isActive && <span className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {template.targetAudience === "stakeholders" ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    <span className="capitalize">{template.frequency}</span>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full mt-4 border-dashed">
                <span className="mr-2">+</span> New Template
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor Area */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Template Editor</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="active-mode" className="text-xs">Active</Label>
                <Switch 
                  id="active-mode" 
                  checked={selectedTemplate.isActive}
                  onCheckedChange={(checked) => handleUpdateTemplate("isActive", checked)}
                />
              </div>
            </div>
            <CardDescription>Configure AI generation rules and schedule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 overflow-auto">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input 
                value={selectedTemplate.name} 
                onChange={(e) => handleUpdateTemplate("name", e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Email Subject Line</Label>
              <Input 
                value={selectedTemplate.subject} 
                onChange={(e) => handleUpdateTemplate("subject", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedTemplate.targetAudience}
                  onChange={(e) => handleUpdateTemplate("targetAudience", e.target.value)}
                >
                  <option value="stakeholders">Stakeholders</option>
                  <option value="engineers">Engineers</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedTemplate.frequency}
                  onChange={(e) => handleUpdateTemplate("frequency", e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  AI Content Prompt
                </Label>
                <Badge variant="outline" className="text-[10px]">GPT-4o</Badge>
              </div>
              <Textarea 
                className="min-h-[200px] font-mono text-sm"
                value={selectedTemplate.aiPrompt}
                onChange={(e) => handleUpdateTemplate("aiPrompt", e.target.value)}
                placeholder="Describe how the AI should generate this email..."
              />
              <p className="text-xs text-muted-foreground">
                Use natural language to instruct the AI on tone, data points to include, and formatting preferences.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t p-4 flex justify-between">
            <Button variant="ghost" onClick={() => setTemplates(DEFAULT_TEMPLATES)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button onClick={generatePreview} disabled={isGenerating}>
              {isGenerating ? (
                <>Generating...</>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Generate Preview
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Preview Area */}
      <div className="lg:col-span-4 space-y-4">
        <Card className="h-full flex flex-col bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4">
            {previewContent ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-4 text-sm border-b pb-2">
                  <div className="flex gap-2 mb-1">
                    <span className="text-muted-foreground w-12">To:</span>
                    <span className="font-medium">
                      {selectedTemplate.targetAudience === "stakeholders" ? "stakeholders@company.com" : "alex.murphy@company.com"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-12">Subject:</span>
                    <span className="font-medium">{selectedTemplate.subject}</span>
                  </div>
                </div>
                <div 
                  className="preview-container bg-white shadow-sm rounded-lg"
                  dangerouslySetInnerHTML={{ __html: previewContent }} 
                />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-50">
                <Mail className="w-12 h-12" />
                <p className="text-sm text-center max-w-[200px]">
                  Click "Generate Preview" to see how the AI renders this template with sample data.
                </p>
              </div>
            )}
          </CardContent>
          {previewContent && (
            <CardFooter className="border-t p-4 bg-white">
              <Button className="w-full" variant="default">
                <Send className="w-4 h-4 mr-2" />
                Send Test Email
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
