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
 * Check if user is authenticated via Azure Easy Auth.
 * Azure Container Apps with Easy Auth set the X-MS-CLIENT-PRINCIPAL header
 * and provide user info at /.auth/me
 */
async function checkAzureAuth(): Promise<User | null> {
  try {
    const response = await fetch('/.auth/me', { credentials: 'include' });
    if (!response.ok) return null;
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Not JSON response, Azure Easy Auth not configured
      return null;
    }
    
    const data = await response.json();
    // Azure Easy Auth can return different formats
    const clientPrincipal = data?.clientPrincipal || (Array.isArray(data) ? data[0] : null);
    
    if (clientPrincipal?.userDetails) {
      return {
        id: clientPrincipal.userId || clientPrincipal.userDetails,
        name: clientPrincipal.userDetails,
        email: clientPrincipal.userDetails,
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

  // Check Azure SSO authentication on mount
  useEffect(() => {
    let mounted = true;
    
    checkAzureAuth().then((azureUser) => {
      if (!mounted) return;
      
      if (azureUser) {
        // User is authenticated via Azure SSO
        setUser(azureUser);
        setIsLoading(false);
      } else {
        // Not authenticated - redirect to Azure SSO login
        // Check if we're already on the login callback to prevent redirect loop
        if (!window.location.pathname.startsWith('/.auth/')) {
          console.log('[Auth] No Azure session, redirecting to SSO login...');
          window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.pathname);
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
