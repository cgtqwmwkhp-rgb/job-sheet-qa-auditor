import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wrench, User, Calendar, AlertTriangle, CheckCircle2, Clock, Package } from "lucide-react";

interface TimelineEvent {
  id: string;
  date: string;
  type: 'visit' | 'alert' | 'part';
  title: string;
  description: string;
  engineer?: string;
  status?: 'completed' | 'failed' | 'pending';
  parts?: string[];
}

interface AssetTimelineProps {
  assetId: string;
  assetName: string;
  events: TimelineEvent[];
}

export function AssetTimeline({ assetId, assetName, events }: AssetTimelineProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Asset History Timeline
            </CardTitle>
            <CardDescription>Lifecycle events for {assetId}</CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">{assetName}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[500px] px-6 pb-6">
          <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 py-4">
            {events.map((event, index) => (
              <div key={event.id} className="relative pl-8">
                {/* Timeline Dot */}
                <div className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white shadow-sm 
                  ${event.type === 'visit' ? 'bg-blue-500' : 
                    event.type === 'alert' ? 'bg-red-500' : 'bg-amber-500'}`} 
                />
                
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-3 w-3" />
                    {event.date}
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 hover:border-blue-100 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                        {event.type === 'visit' && <Wrench className="h-4 w-4 text-blue-500" />}
                        {event.type === 'alert' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        {event.type === 'part' && <Package className="h-4 w-4 text-amber-500" />}
                        {event.title}
                      </h4>
                      {event.status && (
                        <Badge variant={event.status === 'completed' ? 'default' : event.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] h-5">
                          {event.status}
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-3">{event.description}</p>
                    
                    {event.engineer && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-100 w-fit mb-2">
                        <User className="h-3 w-3" />
                        Engineer: {event.engineer}
                      </div>
                    )}

                    {event.parts && event.parts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {event.parts.map((part, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            <Package className="h-3 w-3 mr-1" />
                            {part}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
