import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  User,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";

export default function AuditLog() {
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch audit logs from API
  const { data: logs, isLoading } = trpc.auditLog.list.useQuery({ limit: 100 });

  const filteredLogs =
    logs?.filter(
      log =>
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entityType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(log.entityId).includes(searchTerm)
    ) || [];

  const getStatusBadge = (action: string) => {
    if (action.includes("DELETE") || action.includes("REJECT")) {
      return { variant: "destructive" as const, label: "DESTRUCTIVE" };
    }
    if (action.includes("CREATE") || action.includes("APPROVE")) {
      return {
        variant: "outline" as const,
        label: "SUCCESS",
        className: "bg-green-50 text-green-700 border-green-200",
      };
    }
    return { variant: "secondary" as const, label: "INFO" };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              System Audit Log
            </h1>
            <p className="text-muted-foreground mt-1">
              Security events and access history.
            </p>
          </div>
          <Button variant="outline" className="shrink-0">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader className="border-b space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Security Events
              </CardTitle>
              <div className="flex gap-2 w-full sm:max-w-sm">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search action, entity, or ID..."
                    className="pl-9 h-9"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Filter events"
                  className="shrink-0 h-9 w-9"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription>
              {searchTerm
                ? `${filteredLogs.length} of ${logs?.length ?? 0} events match your search`
                : `Showing ${filteredLogs.length} recent events`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={8} columns={6} />
              </div>
            ) : filteredLogs.length > 0 ? (
              <div className="max-h-[min(70vh,640px)] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[180px] pl-6">
                        Timestamp
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right pr-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map(log => {
                      const status = getStatusBadge(log.action);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground pl-6">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(log.createdAt), {
                                addSuffix: true,
                              })}
                            </div>
                            <div className="opacity-50 mt-1">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                User #{log.userId}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> System User
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.entityType && (
                              <span className="text-muted-foreground">
                                {log.entityType}#{log.entityId}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.details ? JSON.stringify(log.details) : "-"}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Badge
                              variant={status.variant}
                              className={status.className || ""}
                            >
                              {status.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-16 px-6 text-muted-foreground">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center">
                  <ShieldAlert className="h-7 w-7 opacity-60" />
                </div>
                <p className="font-medium text-foreground">
                  {searchTerm ? "No matching events" : "No audit events yet"}
                </p>
                <p className="text-sm mt-1">
                  {searchTerm
                    ? `No results for "${searchTerm}". Try a different term.`
                    : "System activity will appear here as users interact with the platform."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
