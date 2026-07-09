import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BrainCircuit,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";

export interface Prediction {
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
  if (predictions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Predictive alerts</CardTitle>
          </div>
          <CardDescription>
            No high-risk predictions for the current period.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200/80 bg-gradient-to-br from-orange-50/80 to-amber-50/40 dark:from-orange-950/20 dark:to-background dark:border-orange-900/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-orange-700 dark:text-orange-400" />
          <CardTitle className="text-orange-950 dark:text-orange-100">
            Predictive alerts
          </CardTitle>
        </div>
        <CardDescription>
          Entities at elevated risk from leading indicators (minor-issue mix,
          disputes, ambiguity trend).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {predictions.slice(0, 5).map(pred => (
          <div
            key={pred.assetId}
            className="bg-background/80 rounded-lg p-4 border border-orange-100 dark:border-orange-900/50 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="font-semibold text-foreground">
                  {pred.assetId}
                </span>
              </div>
              <Badge
                variant={pred.riskScore > 80 ? "destructive" : "secondary"}
              >
                {pred.riskScore}% Risk
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Failure probability</span>
                  <span>{pred.confidence}% confidence</span>
                </div>
                <Progress value={pred.riskScore} className="h-2" />
              </div>

              <div className="flex items-start gap-2 text-sm text-foreground bg-orange-50/60 dark:bg-orange-950/30 p-2 rounded">
                <Activity className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <p>
                  <span className="font-semibold">Prediction:</span> Attention
                  likely by {pred.predictedFailureDate}.
                  <br />
                  <span className="text-muted-foreground text-xs">
                    {pred.reason}
                  </span>
                </p>
              </div>
            </div>
          </div>
        ))}

        <div className="pt-2 flex justify-end">
          <Link href="/analytics/predictive">
            <a className="text-xs font-medium text-orange-700 dark:text-orange-400 flex items-center hover:underline">
              View attention queue <ArrowRight className="h-3 w-3 ml-1" />
            </a>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
