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

function normalizeRole(raw: unknown): UserRole {
  if (raw === "admin" || raw === "qa_lead" || raw === "technician" || raw === "viewer") {
    return raw;
  }
  // Phase 0 UI: preserve prior behaviour (authenticated staff = admin) until
  // Phase 0 security maps roles from auth.me / Entra claims for real.
  return "admin";
}

/** Playwright / local E2E escape hatch — not used in production Easy Auth. */
function checkDemoAuth(): User | null {
  try {
    const role = localStorage.getItem("demo_user_role") as UserRole | null;
    if (!role) return null;
    if (!["admin", "qa_lead", "technician", "viewer"].includes(role)) return null;
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
    const response = await fetch("/api/trpc/auth.me", {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const user = data?.result?.data;

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
    // Demo / E2E only — production uses Entra via /login.
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
