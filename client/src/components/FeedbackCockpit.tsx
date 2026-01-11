/**
 * Feedback Cockpit Component
 * 
 * UI surface for viewing accuracy trends, scorecards, and fix packs.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Users,
  FileText,
  Layers,
  Calendar,
} from 'lucide-react';

/**
 * Types for cockpit data
 */
interface TrendDataPoint {
  date: string;
  passRate: number;
  volume: number;
  failRate: number;
}

interface CockpitData {
  currentPeriod: {
    period: string;
    periodStart: string;
    periodEnd: string;
    passRate: number;
    volume: number;
    criticalIssues: number;
  };
  trends: TrendDataPoint[];
  topIssues: Array<{
    reasonCode: string;
    count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  recentFixPacks: Array<{
    fixPackId: string;
    target: string;
    issueCount: number;
    priority: string;
  }>;
}

/**
 * Generate mock cockpit data
 */
function generateMockData(): CockpitData {
  const trends: TrendDataPoint[] = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    
    trends.push({
      date: date.toISOString().split('T')[0],
      passRate: 0.88 + Math.random() * 0.08,
      volume: 100 + Math.floor(Math.random() * 200),
      failRate: 0.05 + Math.random() * 0.08,
    });
  }
  
  return {
    currentPeriod: {
      period: 'weekly',
      periodStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: now.toISOString(),
      passRate: trends[trends.length - 1].passRate,
      volume: trends[trends.length - 1].volume,
      criticalIssues: Math.floor(Math.random() * 10),
    },
    trends,
    topIssues: [
      { reasonCode: 'MISSING_FIELD', count: 45, trend: 'up' },
      { reasonCode: 'INVALID_FORMAT', count: 32, trend: 'down' },
      { reasonCode: 'OUT_OF_POLICY', count: 18, trend: 'stable' },
      { reasonCode: 'LOW_CONFIDENCE', count: 12, trend: 'down' },
    ],
    recentFixPacks: [
      { fixPackId: 'fp-001', target: 'Engineer eng-001', issueCount: 12, priority: 'high' },
      { fixPackId: 'fp-002', target: 'Template template-a', issueCount: 8, priority: 'medium' },
      { fixPackId: 'fp-003', target: 'Customer cust-001', issueCount: 5, priority: 'low' },
    ],
  };
}

/**
 * Trend icon component
 */
function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    case 'down':
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    case 'stable':
      return <Minus className="h-4 w-4 text-gray-500" />;
  }
}

/**
 * Priority badge component
 */
function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, 'destructive' | 'secondary' | 'outline'> = {
    critical: 'destructive',
    high: 'destructive',
    medium: 'secondary',
    low: 'outline',
  };
  
  return (
    <Badge variant={variants[priority] || 'outline'}>
      {priority}
    </Badge>
  );
}

/**
 * Mini sparkline for trends
 */
function MiniSparkline({ data }: { data: TrendDataPoint[] }) {
  const max = Math.max(...data.map(d => d.passRate));
  const min = Math.min(...data.map(d => d.passRate));
  const range = max - min || 0.01;
  
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((point, i) => {
        const height = ((point.passRate - min) / range) * 100;
        return (
          <div
            key={i}
            className="w-2 bg-primary/60 rounded-t"
            style={{ height: `${Math.max(height, 10)}%` }}
            title={`${point.date}: ${(point.passRate * 100).toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}

/**
 * Feedback Cockpit main component
 */
export function FeedbackCockpit() {
  const [data] = useState<CockpitData>(generateMockData);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  
  const passRatePercent = (data.currentPeriod.passRate * 100).toFixed(1);
  const passRateClass = data.currentPeriod.passRate >= 0.95 
    ? 'text-green-600' 
    : data.currentPeriod.passRate >= 0.90 
      ? 'text-yellow-600' 
      : 'text-red-600';
  
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accuracy Cockpit</h2>
          <p className="text-muted-foreground">
            Monitor accuracy trends, scorecards, and fix packs
          </p>
        </div>
        <div className="flex gap-2">
          <Badge 
            variant={selectedPeriod === 'daily' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedPeriod('daily')}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Daily
          </Badge>
          <Badge 
            variant={selectedPeriod === 'weekly' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedPeriod('weekly')}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Weekly
          </Badge>
          <Badge 
            variant={selectedPeriod === 'monthly' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedPeriod('monthly')}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Monthly
          </Badge>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${passRateClass}`}>
              {passRatePercent}%
            </div>
            <div className="mt-2">
              <MiniSparkline data={data.trends} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.currentPeriod.volume}</div>
            <p className="text-xs text-muted-foreground">
              This {selectedPeriod === 'daily' ? 'day' : selectedPeriod === 'weekly' ? 'week' : 'month'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.currentPeriod.criticalIssues > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
              {data.currentPeriod.criticalIssues}
            </div>
            <p className="text-xs text-muted-foreground">
              Requiring attention
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Fix Packs</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.recentFixPacks.length}</div>
            <p className="text-xs text-muted-foreground">
              In progress
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="issues">Top Issues</TabsTrigger>
          <TabsTrigger value="fixpacks">Fix Packs</TabsTrigger>
          <TabsTrigger value="scorecards">Scorecards</TabsTrigger>
        </TabsList>
        
        {/* Top Issues Tab */}
        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Issues This {selectedPeriod === 'daily' ? 'Day' : selectedPeriod === 'weekly' ? 'Week' : 'Month'}</CardTitle>
              <CardDescription>
                Most frequent validation failure reasons
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.topIssues.map((issue, i) => (
                  <div key={i} className="flex items-center">
                    <div className="w-40 font-medium text-sm">
                      {issue.reasonCode.replace(/_/g, ' ')}
                    </div>
                    <div className="flex-1">
                      <Progress value={issue.count} max={50} />
                    </div>
                    <div className="w-16 text-right text-sm text-muted-foreground">
                      {issue.count}
                    </div>
                    <div className="w-8 flex justify-end">
                      <TrendIcon trend={issue.trend} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Fix Packs Tab */}
        <TabsContent value="fixpacks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Fix Packs</CardTitle>
              <CardDescription>
                Collections of issues assigned for resolution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.recentFixPacks.map((fixPack, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{fixPack.target}</div>
                        <div className="text-sm text-muted-foreground">
                          {fixPack.issueCount} issues
                        </div>
                      </div>
                    </div>
                    <PriorityBadge priority={fixPack.priority} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Scorecards Tab */}
        <TabsContent value="scorecards" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Engineer Scorecards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['eng-001', 'eng-002', 'eng-003'].map((id, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded">
                      <span className="font-medium">Engineer {id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {(85 + Math.random() * 12).toFixed(1)}% pass rate
                        </span>
                        {i === 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : i === 1 ? (
                          <Minus className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Template Scorecards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['template-a', 'template-b', 'template-c'].map((id, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded">
                      <span className="font-medium">Template {id.split('-')[1].toUpperCase()}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {(90 + Math.random() * 8).toFixed(1)}% accuracy
                        </span>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FeedbackCockpit;
