'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'SUPER_ADMIN' | 'PLANT_SUPERVISOR' | 'FLEET_ADMIN' | 'EMPLOYEE_RIDER' | 'DRIVER';

export interface UserSession {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  siteId: string | null;
  siteName: string;
}

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  login: (sessionData: UserSession) => void;
  logout: () => void;
  switchRole: (newRole: UserRole, siteId?: string, siteName?: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  switchRole: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('plant_transit_active_session');
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }
    setLoading(false);
  }, []);

  const login = (sessionData: UserSession) => {
    setSession(sessionData);
    localStorage.setItem('plant_transit_active_session', JSON.stringify(sessionData));
    document.cookie = `app-user-role=${sessionData.role}; path=/; max-age=604800; SameSite=Lax`;
    document.cookie = `app-auth-session=${sessionData.userId}; path=/; max-age=604800; SameSite=Lax`;
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem('plant_transit_active_session');
    document.cookie = 'app-user-role=; path=/; max-age=0;';
    document.cookie = 'app-auth-session=; path=/; max-age=0;';
  };

  const switchRole = (newRole: UserRole, siteId?: string, siteName?: string) => {
    if (!session) return;
    const updated: UserSession = {
      ...session,
      role: newRole,
      siteId: siteId !== undefined ? siteId : session.siteId,
      siteName: siteName || session.siteName,
    };
    login(updated);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-xs text-slate-500">Initializing session...</div>;
  }

  return (
    <AuthContext.Provider value={{ session, isAuthenticated: !!session, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
