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
import { ShieldAlert, Search, Download, User, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";

function escapeCsvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function downloadAuditLogCsv(
  rows: Array<{
    id: number;
    createdAt: Date | string;
    userId: number | null;
    action: string;
    entityType: string | null;
    entityId: number | string | null;
    details: unknown;
  }>
) {
  const header = [
    "id",
    "timestamp",
    "userId",
    "action",
    "entityType",
    "entityId",
    "details",
  ];
  const lines = [
    header.join(","),
    ...rows.map(log =>
      [
        log.id,
        new Date(log.createdAt).toISOString(),
        log.userId ?? "",
        log.action,
        log.entityType ?? "",
        log.entityId ?? "",
        log.details ? JSON.stringify(log.details) : "",
      ]
        .map(escapeCsvCell)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `audit-log-${stamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function AuditLog() {
  const [searchTerm, setSearchTerm] = useState("");

  const {
    data: logs,
    isLoading,
    isError,
    refetch,
  } = trpc.auditLog.list.useQuery({ limit: 100 });

  const filteredLogs =
    logs?.filter(
      log =>
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entityType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(log.entityId).includes(searchTerm)
    ) || [];

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      toast.info("No audit events to export");
      return;
    }
    downloadAuditLogCsv(filteredLogs);
    toast.success(
      `Exported ${filteredLogs.length} ${filteredLogs.length === 1 ? "event" : "events"}`
    );
  };

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
        {isError ? (
          <Card className="border-destructive/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm font-medium text-destructive">
              Unable to load audit log. Refresh and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              System Audit Log
            </h1>
            <p className="text-muted-foreground mt-1">
              Security events and access history.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={handleExportCsv}
            disabled={isLoading || filteredLogs.length === 0}
          >
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
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search action, entity, or ID..."
                  className="pl-9 h-9"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
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
            ) : isError ? null : filteredLogs.length > 0 ? (
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
