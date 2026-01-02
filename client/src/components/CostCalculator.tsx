import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { PoundSterling, TrendingDown, ArrowRight } from "lucide-react";

export function CostCalculator() {
  const [costPerVisit, setCostPerVisit] = useState(150);
  const [monthlyReturns, setMonthlyReturns] = useState(45);
  const [targetReduction, setTargetReduction] = useState(20);

  const currentMonthlyCost = costPerVisit * monthlyReturns;
  const projectedSavings = (currentMonthlyCost * targetReduction) / 100;
  const annualSavings = projectedSavings * 12;

  return (
    <Card className="bg-emerald-50/50 border-emerald-100">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PoundSterling className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-emerald-900">First Fix Impact Calculator</CardTitle>
        </div>
        <CardDescription className="text-emerald-700">
          Quantify the financial value of reducing return visits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Avg. Cost per Truck Roll (£)</Label>
            <Input 
              type="number" 
              value={costPerVisit} 
              onChange={(e) => setCostPerVisit(Number(e.target.value))}
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly Return Visits</Label>
            <Input 
              type="number" 
              value={monthlyReturns} 
              onChange={(e) => setMonthlyReturns(Number(e.target.value))}
              className="bg-white"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between">
            <Label>Target Reduction Goal</Label>
            <span className="font-bold text-emerald-700">{targetReduction}%</span>
          </div>
          <Slider 
            value={[targetReduction]} 
            onValueChange={(val) => setTargetReduction(val[0])} 
            max={50} 
            step={5}
            className="py-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-200">
          <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Monthly Savings</div>
            <div className="text-2xl font-bold text-emerald-600 flex items-center gap-1">
              £{projectedSavings.toLocaleString()}
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Annual Savings</div>
            <div className="text-2xl font-bold text-emerald-600 flex items-center gap-1">
              £{annualSavings.toLocaleString()}
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
