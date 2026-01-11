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

// Mock users for demo purposes
const MOCK_USERS: Record<UserRole, User> = {
  admin: {
    id: 'usr_admin_001',
    name: 'Sarah Connor',
    email: 'sarah.connor@jobsheetqa.com',
    role: 'admin',
    avatar: 'https://github.com/shadcn.png'
  },
  qa_lead: {
    id: 'usr_qa_001',
    name: 'John Rambo',
    email: 'john.rambo@jobsheetqa.com',
    role: 'qa_lead',
    avatar: 'https://github.com/shadcn.png'
  },
  technician: {
    id: 'usr_tech_001',
    name: 'Alex Murphy',
    email: 'alex.murphy@jobsheetqa.com',
    role: 'technician',
    avatar: 'https://github.com/shadcn.png'
  },
  viewer: {
    id: 'usr_view_001',
    name: 'Guest Viewer',
    email: 'guest@jobsheetqa.com',
    role: 'viewer',
    avatar: 'https://github.com/shadcn.png'
  }
};

/**
 * Check if user is authenticated via Azure Easy Auth.
 * Returns user info if authenticated, null otherwise.
 */
async function checkAzureAuth(): Promise<User | null> {
  try {
    const response = await fetch('/.auth/me', { credentials: 'include' });
    if (!response.ok) return null;
    
    const data = await response.json();
    // Azure Easy Auth returns an array of identity providers
    const clientPrincipal = data?.clientPrincipal || data?.[0];
    
    if (clientPrincipal?.userDetails) {
      // User is authenticated via Azure - auto-login as admin
      return {
        id: clientPrincipal.userId || 'azure_user',
        name: clientPrincipal.userDetails,
        email: clientPrincipal.userDetails,
        role: 'admin',
        avatar: undefined
      };
    }
    return null;
  } catch {
    // Azure Easy Auth not configured or not available
    return null;
  }
}

/**
 * Helper to read initial user from localStorage.
 * Pure function called once during useState initialization.
 */
function getInitialUser(): User | null {
  // Safe to call during initialization - runs once on mount
  if (typeof window === 'undefined') return null;
  const storedRole = localStorage.getItem('demo_user_role') as UserRole;
  if (storedRole && MOCK_USERS[storedRole]) {
    return MOCK_USERS[storedRole];
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Use lazy initializer to avoid useEffect setState pattern
  const [user, setUser] = useState<User | null>(getInitialUser);
  // Start loading only if no user from localStorage - we'll check Azure auth
  const initialUser = getInitialUser();
  const [isLoading, setIsLoading] = useState(!initialUser);
  const [authChecked, setAuthChecked] = useState(!!initialUser);

  // Check for Azure Easy Auth on mount
  useEffect(() => {
    // If already checked (user from localStorage), skip
    if (authChecked) {
      return;
    }

    // Check if Azure Easy Auth is active
    let mounted = true;
    checkAzureAuth().then((azureUser) => {
      if (!mounted) return;
      if (azureUser) {
        setUser(azureUser);
        localStorage.setItem('demo_user_role', 'admin');
      }
      setIsLoading(false);
      setAuthChecked(true);
    });

    return () => { mounted = false; };
  }, [authChecked]);

  const login = (role: UserRole) => {
    const newUser = MOCK_USERS[role];
    setUser(newUser);
    localStorage.setItem('demo_user_role', role);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('demo_user_role');
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
