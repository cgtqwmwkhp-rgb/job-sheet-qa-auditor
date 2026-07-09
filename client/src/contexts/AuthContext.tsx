import React, { createContext, useContext, useState, useEffect } from "react";

export type UserRole = "admin" | "qa_lead" | "technician" | "viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (role: UserRole) => void;
  logout: () => void;
  isLoading: boolean;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Demo / Playwright escape hatch — never in production builds. */
export function isDemoAuthAllowed(): boolean {
  return Boolean(import.meta.env.DEV);
}

/**
 * Map DB / auth.me roles onto client UserRole.
 * DB enum is user|admin|qa_lead|technician — client uses viewer for DB "user".
 */
function normalizeRole(raw: unknown): UserRole {
  if (raw === "admin" || raw === "qa_lead" || raw === "technician") {
    return raw;
  }
  if (raw === "viewer" || raw === "user") {
    return "viewer";
  }
  // Unknown / missing role → least privilege (never elevate to admin).
  return "viewer";
}

function checkDemoAuth(): User | null {
  if (!isDemoAuthAllowed()) return null;
  try {
    const role = localStorage.getItem("demo_user_role") as UserRole | null;
    if (!role) return null;
    if (!["admin", "qa_lead", "technician", "viewer"].includes(role))
      return null;
    return {
      id: "demo-user",
      name: localStorage.getItem("demo_user_name") || "Demo User",
      email: localStorage.getItem("demo_user_email") || "demo@example.com",
      role,
    };
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated via backend tRPC auth.me endpoint.
 * The backend handles Azure Easy Auth headers (X-MS-CLIENT-PRINCIPAL).
 */
async function checkAuth(): Promise<User | null> {
  const demo = checkDemoAuth();
  if (demo) return demo;

  try {
    // redirect:manual — Easy Auth must not follow 302→login.windows.net on this
    // XHR (that triggers a CORS failure and breaks the SPA). Treat opaqueredirect
    // / non-OK as signed-out so /login can render the Entra CTA.
    const response = await fetch("/api/trpc/auth.me", {
      credentials: "include",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (response.type === "opaqueredirect" || response.status === 0) {
      return null;
    }
    if (!response.ok) return null;

    const data = await response.json();
    const user = data?.result?.data?.json ?? data?.result?.data;

    if (user?.id || user?.openId) {
      return {
        id: user.id?.toString() || user.openId,
        name: user.name || "User",
        email: user.email || "",
        role: normalizeRole(user.role),
        avatar: undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    checkAuth().then(authUser => {
      if (!mounted) return;
      setUser(authUser);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const login = (role: UserRole) => {
    if (!isDemoAuthAllowed()) return;
    try {
      localStorage.setItem("demo_user_role", role);
      localStorage.setItem(
        "demo_user_name",
        role === "technician" ? "John Smith" : "Sarah Connor"
      );
      localStorage.setItem(
        "demo_user_email",
        role === "technician" ? "john@example.com" : "sarah@example.com"
      );
    } catch {
      /* ignore */
    }
    setUser({
      id: "demo-user",
      name: role === "technician" ? "John Smith" : "Sarah Connor",
      email: role === "technician" ? "john@example.com" : "sarah@example.com",
      role,
    });
  };

  const logout = () => {
    try {
      localStorage.removeItem("demo_user_role");
      localStorage.removeItem("demo_user_name");
      localStorage.removeItem("demo_user_email");
    } catch {
      /* ignore */
    }
    window.location.href = "/.auth/logout?post_logout_redirect_uri=/login";
  };

  const hasRole = (roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
