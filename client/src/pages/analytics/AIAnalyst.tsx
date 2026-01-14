import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function AIAnalyst() {
  return (
    <AnalyticsLayout 
      title="AI Analyst" 
      description="AI-powered insights and recommendations."
    >
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">AI Analyst Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            AI-powered insights, natural language queries, and automated recommendations 
            will be available in a future update.
          </p>
        </div>
      </Card>
    </AnalyticsLayout>
  );
}
