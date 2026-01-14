import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function DefectAnalysis() {
  return (
    <AnalyticsLayout 
      title="Defect Analysis" 
      description="Deep-dive analysis of defect patterns and root causes."
    >
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <AlertTriangle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Defect Analysis Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Pareto charts, heatmaps, and defect pattern analysis will be available 
            once sufficient audit data with defect classifications is collected.
          </p>
        </div>
      </Card>
    </AnalyticsLayout>
  );
}
