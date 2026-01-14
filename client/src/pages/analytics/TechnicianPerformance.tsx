import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function TechnicianPerformance() {
  return (
    <AnalyticsLayout 
      title="Technician Performance" 
      description="Track and compare technician quality metrics."
    >
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Users className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Technician Leaderboard Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Individual technician performance metrics, rankings, and improvement trends 
            will be available once sufficient audit data with technician attribution is collected.
          </p>
        </div>
      </Card>
    </AnalyticsLayout>
  );
}
