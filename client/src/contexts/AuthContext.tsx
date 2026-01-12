import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'admin' | 'qa_lead' | 'technician' | 'viewer';

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

/**
 * Check if user is authenticated via backend tRPC auth.me endpoint.
 * The backend handles Azure Easy Auth headers (X-MS-CLIENT-PRINCIPAL).
 */
async function checkAuth(): Promise<User | null> {
  try {
    // Call the backend auth.me endpoint which handles Azure Easy Auth
    const response = await fetch('/api/trpc/auth.me', { 
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const user = data?.result?.data;
    
    if (user?.id || user?.openId) {
      return {
        id: user.id?.toString() || user.openId,
        name: user.name || 'User',
        email: user.email || '',
        role: 'admin',
        avatar: undefined
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

  // Check authentication on mount
  useEffect(() => {
    let mounted = true;
    
    checkAuth().then((authUser) => {
      if (!mounted) return;
      
      if (authUser) {
        // User is authenticated
        setUser(authUser);
        setIsLoading(false);
      } else {
        // Not authenticated - redirect to Azure SSO login
        // Check if we're already on the login callback to prevent redirect loop
        const path = window.location.pathname;
        if (!path.startsWith('/.auth/') && !path.includes('callback')) {
          console.log('[Auth] No session, redirecting to Azure SSO login...');
          window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.href);
        } else {
          setIsLoading(false);
        }
      }
    });
    
    return () => { mounted = false; };
  }, []);

  const login = (role: UserRole) => {
    // No-op - Azure SSO handles auth
    console.log('login called with role:', role);
  };

  const logout = () => {
    // Redirect to Azure logout
    window.location.href = '/.auth/logout';
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
