import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function FirstFixAnalysis() {
  return (
    <AnalyticsLayout 
      title="First Fix Rate Analysis" 
      description="Analyze first-time fix rates and service efficiency."
    >
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">First Fix Rate Analysis Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            First-time fix rate metrics, timeline analysis, and predictive insights 
            will be available once service outcome data is integrated.
          </p>
        </div>
      </Card>
    </AnalyticsLayout>
  );
}
