import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BrainCircuit, TrendingUp, Activity, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Prediction {
  assetId: string;
  riskScore: number; // 0-100
  predictedFailureDate: string;
  reason: string;
  confidence: number; // 0-100
}

interface PredictiveAlertsProps {
  predictions: Prediction[];
}

export function PredictiveAlerts({ predictions }: PredictiveAlertsProps) {
  return (
    <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-red-100">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-red-600" />
          <CardTitle className="text-red-900">AI Predictive Health</CardTitle>
        </div>
        <CardDescription className="text-red-700">
          Assets at high risk of imminent failure based on 15/30-day return patterns.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {predictions.map((pred) => (
          <div key={pred.assetId} className="bg-white/80 rounded-lg p-4 border border-red-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="font-bold text-slate-800">{pred.assetId}</span>
              </div>
              <Badge variant={pred.riskScore > 80 ? "destructive" : "secondary"} className="animate-pulse">
                {pred.riskScore}% Risk
              </Badge>
            </div>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Failure Probability</span>
                  <span>{pred.confidence}% Confidence</span>
                </div>
                <Progress value={pred.riskScore} className="h-2 bg-red-100 [&>div]:bg-red-500" />
              </div>
              
              <div className="flex items-start gap-2 text-sm text-slate-700 bg-red-50/50 p-2 rounded">
                <Activity className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p>
                  <span className="font-semibold">Prediction:</span> Failure likely by {pred.predictedFailureDate}. 
                  <br/>
                  <span className="text-slate-500 text-xs">{pred.reason}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
        
        <div className="pt-2 flex justify-end">
          <button className="text-xs font-medium text-red-600 flex items-center hover:underline">
            View All Predictions <ArrowRight className="h-3 w-3 ml-1" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
