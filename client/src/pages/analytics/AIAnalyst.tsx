import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bot, Sparkles, TrendingUp, AlertTriangle, Lightbulb, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// Mock AI Insights
const insights = [
  {
    id: 1,
    type: "anomaly",
    title: "Unusual Defect Spike Detected",
    description: "There has been a 45% increase in 'Missing Serial #' defects at the Leeds Hub over the last 48 hours. This correlates with the onboarding of 3 new technicians.",
    impact: "High",
    action: "Schedule refresher training for Leeds team.",
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200"
  },
  {
    id: 2,
    type: "trend",
    title: "Positive Performance Trend",
    description: "The 'London HQ' site has achieved a 98% pass rate for 7 consecutive days, surpassing the regional benchmark by 5%.",
    impact: "Positive",
    action: "Recognize London team in weekly newsletter.",
    icon: TrendingUp,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200"
  },
  {
    id: 3,
    type: "optimization",
    title: "Process Optimization Opportunity",
    description: "Analysis suggests that 80% of 'Unclear Photo' defects occur between 4 PM and 6 PM. Lighting conditions may be a factor.",
    impact: "Medium",
    action: "Recommend flash usage or earlier scheduling.",
    icon: Lightbulb,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200"
  }
];

export default function AIAnalyst() {
  return (
    <AnalyticsLayout 
      title="AI Analyst" 
      description="Automated insights, anomaly detection, and strategic recommendations."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {/* Chat Interface Placeholder */}
        <Card className="md:col-span-2 flex flex-col h-[600px]">
          <CardHeader className="border-b bg-muted/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>AI Data Assistant</CardTitle>
                <CardDescription>Ask questions about your audit data in plain English.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted p-3 rounded-lg rounded-tl-none max-w-[80%]">
                    <p className="text-sm">Hello! I've analyzed your latest audit data. I found some interesting patterns in the Leeds Hub performance. Would you like to see the details?</p>
                  </div>
                </div>
                
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-700">ME</span>
                  </div>
                  <div className="bg-primary text-primary-foreground p-3 rounded-lg rounded-tr-none max-w-[80%]">
                    <p className="text-sm">Yes, show me the top defects for Leeds this week.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted p-3 rounded-lg rounded-tl-none max-w-[80%] space-y-2">
                    <p className="text-sm">Here are the top 3 defects for Leeds Hub (Last 7 Days):</p>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                      <li><strong>Missing Serial #</strong>: 45 occurrences (+12%)</li>
                      <li><strong>Blurry Text</strong>: 12 occurrences (-5%)</li>
                      <li><strong>Incorrect Date</strong>: 8 occurrences (Stable)</li>
                    </ul>
                    <p className="text-sm mt-2">Shall I draft an email to the Leeds Site Manager about the Serial Number issue?</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
            <div className="p-4 border-t bg-background">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Ask a question about your data..." 
                  className="w-full pl-4 pr-12 py-3 rounded-full border focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button size="icon" className="absolute right-1 top-1 rounded-full w-10 h-10">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Insights Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Strategic Insights
            </h3>
            <Badge variant="outline">3 New</Badge>
          </div>
          
          {insights.map((insight) => (
            <Card key={insight.id} className={`${insight.bg} ${insight.border} border shadow-sm`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className={`p-2 rounded-lg bg-white/50 ${insight.color}`}>
                    <insight.icon className="w-5 h-5" />
                  </div>
                  <Badge variant="secondary" className="bg-white/50 backdrop-blur-sm">
                    {insight.impact} Impact
                  </Badge>
                </div>
                <div>
                  <h4 className={`font-semibold ${insight.color}`}>{insight.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {insight.description}
                  </p>
                </div>
                <Button variant="outline" className="w-full bg-white/50 hover:bg-white border-none shadow-sm text-sm h-8">
                  {insight.action}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AnalyticsLayout>
  );
}
