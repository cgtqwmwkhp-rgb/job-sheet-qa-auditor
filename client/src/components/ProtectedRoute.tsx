import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  component: React.ComponentType<Record<string, unknown>>;
  allowedRoles?: UserRole[];
  path?: string;
}

export function ProtectedRoute({
  component: Component,
  allowedRoles,
  ...rest
}: ProtectedRouteProps) {
  const { user, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <h1 className="text-4xl font-bold text-destructive">403</h1>
        <p className="text-xl text-muted-foreground">Access Denied</p>
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return <Component {...rest} />;
}
