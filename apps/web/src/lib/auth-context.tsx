'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'SUPER_ADMIN' | 'PLANT_SUPERVISOR' | 'FLEET_ADMIN' | 'EMPLOYEE_RIDER' | 'DRIVER';

export interface UserSession {
  userId: string;
  fullName: string;
  role: UserRole;
  siteId: string | null;
  siteName: string;
}

interface AuthContextType {
  session: UserSession;
  switchRole: (newRole: UserRole, siteId?: string, siteName?: string) => void;
}

const DEFAULT_SESSION: UserSession = {
  userId: 'usr-super-admin-01',
  fullName: 'Dhaval Mungara',
  role: 'SUPER_ADMIN',
  siteId: '11111111-1111-1111-1111-111111111111',
  siteName: 'Vadodara Chemical Complex',
};

const AuthContext = createContext<AuthContextType>({
  session: DEFAULT_SESSION,
  switchRole: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession>(DEFAULT_SESSION);

  useEffect(() => {
    const saved = localStorage.getItem('plant_transit_active_session');
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const switchRole = (newRole: UserRole, siteId?: string, siteName?: string) => {
    const updated: UserSession = {
      ...session,
      role: newRole,
      siteId: siteId !== undefined ? siteId : session.siteId,
      siteName: siteName || session.siteName,
    };
    setSession(updated);
    localStorage.setItem('plant_transit_active_session', JSON.stringify(updated));
    document.cookie = `app-user-role=${newRole}; path=/; max-age=86400`;
  };

  return (
    <AuthContext.Provider value={{ session, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
