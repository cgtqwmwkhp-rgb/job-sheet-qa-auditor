import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Download, 
  User, 
  Globe, 
  Clock 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  resource: string;
  status: "success" | "denied" | "warning";
  ip: string;
}

const MOCK_LOGS: AuditEvent[] = [
  {
    id: "evt_001",
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    user: "sarah.connor@jobsheetqa.com",
    role: "admin",
    action: "ACCESS_PAGE",
    resource: "/disputes",
    status: "success",
    ip: "192.168.1.42"
  },
  {
    id: "evt_002",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    user: "alex.murphy@jobsheetqa.com",
    role: "technician",
    action: "ACCESS_ATTEMPT",
    resource: "/disputes",
    status: "denied",
    ip: "10.0.0.5"
  },
  {
    id: "evt_003",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    user: "john.rambo@jobsheetqa.com",
    role: "qa_lead",
    action: "RESOLVE_DISPUTE",
    resource: "dsp_9928",
    status: "success",
    ip: "172.16.0.23"
  },
  {
    id: "evt_004",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    user: "system",
    role: "system",
    action: "SEND_EMAIL",
    resource: "daily_summary",
    status: "success",
    ip: "localhost"
  },
  {
    id: "evt_005",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    user: "unknown",
    role: "unknown",
    action: "LOGIN_ATTEMPT",
    resource: "/portal/login",
    status: "warning",
    ip: "45.22.19.112"
  }
];

export default function AuditLog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [logs] = useState<AuditEvent[]>(MOCK_LOGS);

  const filteredLogs = logs.filter(log => 
    log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resource.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Audit Log</h1>
          <p className="text-muted-foreground mt-1">Security events and access history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Security Events
            </CardTitle>
            <div className="flex gap-2 w-full max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search logs..." 
                  className="pl-8" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            Showing {filteredLogs.length} events from the last 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>User / Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                      </div>
                      <div className="opacity-50 mt-1">{new Date(log.timestamp).toLocaleTimeString()}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{log.user}</span>
                        <span className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                          <User className="h-3 w-3" /> {log.role}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.resource}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {log.ip}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={
                          log.status === "success" ? "outline" : 
                          log.status === "denied" ? "destructive" : "secondary"
                        }
                        className={
                          log.status === "success" ? "bg-green-50 text-green-700 border-green-200" : ""
                        }
                      >
                        {log.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
