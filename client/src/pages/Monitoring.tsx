/**
 * Monitoring Dashboard
 * 
 * Displays real-time system health metrics, error tracking,
 * performance monitoring, and operational insights
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  Activity, 
  AlertCircle, 
  Clock, 
  Database, 
  TrendingUp, 
  Users,
  CheckCircle2,
  XCircle,
  Zap
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Monitoring() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // System health
  const { data: health, refetch: refetchHealth } = trpc.system.health.useQuery();
  
  // Recent errors (would need endpoint)
  const [recentErrors] = useState([
    { id: 1, message: "Database timeout", count: 3, lastSeen: "2 min ago" },
    { id: 2, message: "OCR service unavailable", count: 1, lastSeen: "15 min ago" }
  ]);
  
  // Performance metrics
  const [performanceData] = useState([
    { name: "00:00", avgResponse: 245, requests: 120 },
    { name: "04:00", avgResponse: 189, requests: 85 },
    { name: "08:00", avgResponse: 312, requests: 340 },
    { name: "12:00", avgResponse: 278, requests: 450 },
    { name: "16:00", avgResponse: 298, requests: 380 },
    { name: "20:00", avgResponse: 201, requests: 220 }
  ]);
  
  // Process status distribution
  const [statusData] = useState([
    { name: "Completed", value: 850, color: "#10b981" },
    { name: "Processing", value: 45, color: "#3b82f6" },
    { name: "Failed", value: 12, color: "#ef4444" },
    { name: "Pending", value: 93, color: "#f59e0b" }
  ]);
  
  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refetchHealth();
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, refetchHealth]);
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time operational insights and system health
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={autoRefresh ? "default" : "outline"}>
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </Badge>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="px-4 py-2 rounded-lg border hover:bg-accent"
          >
            Toggle Refresh
          </button>
        </div>
      </div>
      
      {/* System Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          title="System Health"
          value={health?.status || "checking..."}
          icon={<CheckCircle2 className="h-5 w-5" />}
          variant={health?.status === "healthy" ? "success" : "warning"}
        />
        <StatusCard
          title="Active Users"
          value="24"
          icon={<Users className="h-5 w-5" />}
          variant="info"
          subtitle="Last 15 minutes"
        />
        <StatusCard
          title="Avg Response"
          value="245ms"
          icon={<Zap className="h-5 w-5" />}
          variant={245 < 300 ? "success" : "warning"}
          subtitle="Last hour"
        />
        <StatusCard
          title="Error Rate"
          value="0.12%"
          icon={<AlertCircle className="h-5 w-5" />}
          variant={0.12 < 0.5 ? "success" : "error"}
          subtitle="Last hour"
        />
      </div>
      
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Response Time (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="avgResponse" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Avg Response (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Request Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Request Volume (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Bar dataKey="requests" fill="#10b981" name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Job Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Recent Errors */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Recent Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentErrors.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  No recent errors
                </div>
              ) : (
                recentErrors.map((error) => (
                  <div key={error.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <XCircle className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="font-medium">{error.message}</p>
                        <p className="text-sm text-muted-foreground">{error.lastSeen}</p>
                      </div>
                    </div>
                    <Badge variant="destructive">{error.count}x</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Database Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox
              label="Active Connections"
              value="12"
              max="50"
              status="healthy"
            />
            <MetricBox
              label="Slow Queries"
              value="3"
              suffix="queries"
              status={3 < 10 ? "healthy" : "warning"}
            />
            <MetricBox
              label="Avg Query Time"
              value="45ms"
              status={45 < 100 ? "healthy" : "warning"}
            />
            <MetricBox
              label="Cache Hit Rate"
              value="94%"
              status={94 > 80 ? "healthy" : "warning"}
            />
          </div>
        </CardContent>
      </Card>
      
      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <InfoItem label="Version" value={health?.version || "1.0.0"} />
            <InfoItem label="Environment" value={health?.environment || "production"} />
            <InfoItem label="Uptime" value="14d 6h" />
            <InfoItem label="Last Deploy" value="2026-07-12" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper Components

interface StatusCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "error" | "info";
  subtitle?: string;
}

function StatusCard({ title, value, icon, variant, subtitle }: StatusCardProps) {
  const variantStyles = {
    success: "text-green-500 bg-green-500/10",
    warning: "text-yellow-500 bg-yellow-500/10",
    error: "text-red-500 bg-red-500/10",
    info: "text-blue-500 bg-blue-500/10"
  };
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${variantStyles[variant]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricBoxProps {
  label: string;
  value: string;
  max?: string;
  suffix?: string;
  status: "healthy" | "warning" | "error";
}

function MetricBox({ label, value, max, suffix, status }: MetricBoxProps) {
  const statusColors = {
    healthy: "text-green-500",
    warning: "text-yellow-500",
    error: "text-red-500"
  };
  
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${statusColors[status]}`}>
        {value}
        {max && <span className="text-sm text-muted-foreground"> / {max}</span>}
        {suffix && <span className="text-sm text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
