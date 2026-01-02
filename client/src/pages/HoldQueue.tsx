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
import { AlertCircle, CheckCircle2, Clock, Filter, MoreHorizontal, Search, XCircle } from "lucide-react";
import { Link } from "wouter";

// Mock Data
const holdItems = [
  {
    id: "JS-2024-023",
    technician: "Sarah Smith",
    site: "Manchester Branch",
    date: "2024-01-15 14:30",
    reason: "Missing Signature",
    severity: "critical",
    status: "pending",
    assignee: "Unassigned",
  },
  {
    id: "JS-2024-021",
    technician: "Mike Johnson",
    site: "Leeds Depot",
    date: "2024-01-15 11:15",
    reason: "Unclear Photo",
    severity: "warning",
    status: "in_review",
    assignee: "Jane Doe",
  },
  {
    id: "JS-2024-019",
    technician: "David Brown",
    site: "London HQ",
    date: "2024-01-14 16:45",
    reason: "Incorrect Date",
    severity: "minor",
    status: "pending",
    assignee: "Unassigned",
  },
  {
    id: "JS-2024-015",
    technician: "Emily Davis",
    site: "Birmingham Hub",
    date: "2024-01-14 09:20",
    reason: "Missing Serial #",
    severity: "critical",
    status: "escalated",
    assignee: "Team Lead",
  },
];

export default function HoldQueue() {
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
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">All (23)</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">Critical (7)</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">Warnings (12)</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">Minor (4)</Badge>
          </div>
        </div>

        {/* Queue Table */}
        <Card>
          <CardHeader className="px-6 py-4 border-b">
            <CardTitle className="text-base">Pending Reviews</CardTitle>
            <CardDescription>
              Items are sorted by severity and wait time.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Technician / Site</TableHead>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-medium">
                      <Link href={`/audits?id=${item.id}`} className="hover:underline text-primary">
                        {item.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.technician}</div>
                      <div className="text-xs text-muted-foreground">{item.site}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.date}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          item.severity === 'critical' ? 'destructive' : 
                          item.severity === 'warning' ? 'secondary' : 'outline'
                        }
                        className={item.severity === 'warning' ? 'bg-orange-100 text-orange-800 hover:bg-orange-200' : ''}
                      >
                        {item.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        {item.status === 'pending' && <Clock className="w-4 h-4 text-muted-foreground" />}
                        {item.status === 'in_review' && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                        {item.status === 'escalated' && <AlertCircle className="w-4 h-4 text-red-500" />}
                        <span className="capitalize">{item.status.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.assignee}
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
                          <DropdownMenuItem>Assign to me</DropdownMenuItem>
                          <DropdownMenuItem>Escalate</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
