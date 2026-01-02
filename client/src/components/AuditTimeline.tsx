import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity } from "@/lib/api";
import { CheckCircle2, AlertCircle, MessageSquare, Clock, FileText } from "lucide-react";

interface AuditTimelineProps {
  activities: Activity[];
}

export function AuditTimeline({ activities }: AuditTimelineProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "audit":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "review":
        return <MessageSquare className="h-4 w-4 text-orange-500" />;
      case "system":
        return <AlertCircle className="h-4 w-4 text-purple-500" />;
      case "approval":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Audit History</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-6">
            {activities.map((activity, index) => (
              <div key={activity.id} className="relative flex gap-4">
                {/* Timeline Line */}
                {index !== activities.length - 1 && (
                  <div className="absolute left-[19px] top-8 h-full w-[2px] bg-muted" />
                )}
                
                {/* Icon Bubble */}
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                  {getIcon(activity.type)}
                </div>
                
                {/* Content */}
                <div className="flex flex-col gap-1 pt-1">
                  <p className="text-sm font-medium leading-none">{activity.message}</p>
                  <p className="text-xs text-muted-foreground">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
