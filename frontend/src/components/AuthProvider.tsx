"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  setAccessToken, setRefreshToken, setUser, getRefreshToken,
  getUser, clearAuth, User
} from "@/lib/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Restore session from refresh token on mount
  useEffect(() => {
    const restore = async () => {
      const refreshToken = getRefreshToken();
      const cachedUser = getUser();

      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/proxy/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.access_token);

          // Fetch user profile
          const meRes = await fetch("/api/proxy/auth/me", {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          if (meRes.ok) {
            const userData = await meRes.json();
            setUserState(userData);
            setUser(userData);
          } else if (cachedUser) {
            setUserState(cachedUser);
          }
        } else {
          clearAuth();
        }
      } catch {
        if (cachedUser) setUserState(cachedUser);
      } finally {
        setIsLoading(false);
      }
    };

    restore();
  }, []);

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_PATHS.some(p => pathname?.startsWith(p));
    if (!user && !isPublic) {
      router.push("/login");
    } else if (user && isPublic) {
      router.push("/");
    }
  }, [user, isLoading, pathname, router]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/proxy/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login failed");
    }

    const data = await res.json();
    setAccessToken(data.access_token);
    setRefreshToken(data.refresh_token);

    const meRes = await fetch("/api/proxy/auth/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (meRes.ok) {
      const userData = await meRes.json();
      setUserState(userData);
      setUser(userData);
    }

    router.push("/");
  }, [router]);

  const logout = useCallback(() => {
    clearAuth();
    setUserState(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
