import React, { createContext, useContext, useState } from 'react';

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
  // Loading is false immediately since we read synchronously from localStorage
  const [isLoading] = useState(false);

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
