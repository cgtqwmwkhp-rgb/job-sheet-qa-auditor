import DashboardLayout from "@/components/DashboardLayout";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreHorizontal, Search, Shield, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import {
  showSaveSuccessToast,
  showMutationErrorToast,
} from "@/lib/toastHelpers";

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch users from API
  const { data: users, isLoading } = trpc.users.list.useQuery();
  const updateRole = trpc.users.updateRole.useMutation();
  const utils = trpc.useUtils();

  const handleRoleChange = (userId: number, newRole: string) => {
    updateRole.mutate(
      { id: userId, role: newRole as any },
      {
        onSuccess: () => {
          showSaveSuccessToast("User role");
          utils.users.list.invalidate();
        },
        onError: error => {
          showMutationErrorToast(error, "update user role");
        },
      }
    );
  };

  // Filter users by search term
  const filteredUsers =
    users?.filter(
      user =>
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  // Calculate stats. Store timestamp in state (initialized once on mount).
  const [mountTime] = useState(() => Date.now());
  const totalUsers = users?.length || 0;
  const activeUsers = useMemo(() => {
    return (
      users?.filter(u => {
        if (!u.lastSignedIn) return false;
        const lastActive = new Date(u.lastSignedIn);
        const hourAgo = new Date(mountTime - 60 * 60 * 1000);
        return lastActive > hourAgo;
      }).length || 0
    );
  }, [users, mountTime]);
  const adminCount = users?.filter(u => u.role === "admin").length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="pb-4 border-b border-border/50 space-y-4">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              User Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage user access, roles, and permissions.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {totalUsers} {totalUsers === 1 ? "user" : "users"} registered. New
            users appear here after they sign in for the first time.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Registered accounts
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Now</CardTitle>
              <div className="h-2 w-2 rounded-full bg-brand-lime animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeUsers}</div>
              <p className="text-xs text-muted-foreground">
                Active in last hour
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminCount}</div>
              <p className="text-xs text-muted-foreground">
                Full system access
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Users</CardTitle>
              <Badge variant="secondary">
                {searchTerm
                  ? `${filteredUsers.length} of ${totalUsers}`
                  : `${filteredUsers.length} ${filteredUsers.length === 1 ? "user" : "users"}`}
              </Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                className="pl-8 h-9"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={6} columns={5} />
              </div>
            ) : filteredUsers.length > 0 ? (
              <div className="max-h-[min(70vh,640px)] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="pl-6">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {user.name || "Unknown User"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {user.email || "No email"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {user.role === "admin" && (
                              <Shield className="w-3 h-3 text-primary" />
                            )}
                            <span className="capitalize">
                              {user.role?.replace("_", " ") || "User"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.lastSignedIn ? "default" : "secondary"
                            }
                          >
                            {user.lastSignedIn ? "active" : "inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {user.lastSignedIn
                            ? formatDistanceToNow(new Date(user.lastSignedIn), {
                                addSuffix: true,
                              })
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${user.name || user.email}`}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(user.id, "admin")
                                }
                              >
                                Make Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(user.id, "qa_lead")
                                }
                              >
                                Make QA Lead
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(user.id, "technician")
                                }
                              >
                                Make Technician
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(user.id, "viewer")
                                }
                              >
                                Make Viewer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-16 px-6 text-muted-foreground">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center">
                  <User className="h-7 w-7 opacity-60" />
                </div>
                <p className="font-medium text-foreground">
                  {searchTerm ? "No matching users" : "No users yet"}
                </p>
                <p className="text-sm mt-1">
                  {searchTerm
                    ? `No results for "${searchTerm}". Try a different name or email.`
                    : "Users appear here after they sign in with an allowed account."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
