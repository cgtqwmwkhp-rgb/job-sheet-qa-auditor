import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Clock, Filter, Loader2, MoreHorizontal, Search, XCircle, Inbox } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function HoldQueue() {
  // Fetch real review queue data from backend
  const { data: jobSheets, isLoading, error } = trpc.jobSheets.list.useQuery({
    status: 'review_queue',
    limit: 50,
  });
  
  // Transform job sheets to hold queue items
  const holdItems = (jobSheets || []).map((sheet) => ({
    id: sheet.id,
    referenceNumber: sheet.referenceNumber || `JS-${sheet.id}`,
    technician: `User ${sheet.uploadedBy}`,
    site: sheet.siteInfo || 'Unknown Site',
    date: new Date(sheet.createdAt).toLocaleString(),
    reason: 'Review Required', // Will be populated from audit findings
    severity: 'warning' as const,
    status: 'pending' as const,
    fileName: sheet.fileName,
  }));
  
  const totalItems = holdItems.length;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Hold Queue</h1>
            <p className="text-muted-foreground mt-1">
              Review and resolve flagged job sheets requiring manual intervention.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Bulk Approve
            </Button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by ID, technician, or site..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              All ({totalItems})
            </Badge>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading review queue...</p>
            </div>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-destructive">
              <AlertCircle className="h-16 w-16 mb-4" />
              <p className="font-semibold">Failed to load review queue</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {!isLoading && !error && holdItems.length === 0 && (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Review Queue Empty</h2>
              <p className="text-muted-foreground max-w-md">
                No job sheets are currently awaiting review. All documents have been processed successfully.
              </p>
            </div>
          </Card>
        )}

        {/* Queue Table */}
        {!isLoading && !error && holdItems.length > 0 && (
          <Card>
            <CardHeader className="px-6 py-4 border-b">
              <CardTitle className="text-base">Pending Reviews ({totalItems})</CardTitle>
              <CardDescription>
                Items sorted by upload date (newest first).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Reference</TableHead>
                    <TableHead>File / Site</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-medium">
                        <Link href={`/audits?id=${item.id}`} className="hover:underline text-primary">
                          {item.referenceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium truncate max-w-[200px]" title={item.fileName}>
                          {item.fileName}
                        </div>
                        <div className="text-xs text-muted-foreground">{item.site}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.date}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                          {item.reason}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="capitalize">{item.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem>
                              <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <XCircle className="w-4 h-4 mr-2 text-red-600" />
                              Reject
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
