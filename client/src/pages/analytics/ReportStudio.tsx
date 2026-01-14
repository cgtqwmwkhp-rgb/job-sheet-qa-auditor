import { AnalyticsLayout } from "./AnalyticsLayout";
import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function ReportStudio() {
  return (
    <AnalyticsLayout 
      title="Report Studio" 
      description="Create, schedule, and manage custom reports."
    >
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <FileText className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Report Studio Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Custom report builder, scheduled reports, and automated email delivery 
            will be available in a future update.
          </p>
        </div>
      </Card>
    </AnalyticsLayout>
  );
}
