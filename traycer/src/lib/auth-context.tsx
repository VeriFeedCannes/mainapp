"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

export interface PlateAssociation {
  nfcUid: string;
  associatedAt: number;
}

interface AuthState {
  walletAddress: string | null;
  username: string | null;
  isConnected: boolean;
  plate: PlateAssociation | null;
}

interface AuthContextType extends AuthState {
  setAuth: (wallet: string, username: string) => void;
  clearAuth: () => void;
  setPlate: (plate: PlateAssociation | null) => void;
}

const AUTH_STORAGE_KEY = "verifeed_auth";

const AuthContext = createContext<AuthContextType | null>(null);

function loadPersistedAuth(): { wallet: string; username: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.wallet && data.username) return data;
  } catch { /* corrupted */ }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    walletAddress: null,
    username: null,
    isConnected: false,
    plate: null,
  });

  useEffect(() => {
    const persisted = loadPersistedAuth();
    if (persisted) {
      setState((prev) => ({
        ...prev,
        walletAddress: persisted.wallet,
        username: persisted.username,
        isConnected: true,
      }));
    }
  }, []);

  const setAuth = useCallback((wallet: string, username: string) => {
    const displayName = username || wallet.slice(0, 6) + "..." + wallet.slice(-4);
    setState((prev) => ({
      ...prev,
      walletAddress: wallet,
      username: displayName,
      isConnected: true,
    }));
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ wallet, username: displayName }));
    } catch { /* quota */ }
  }, []);

  const clearAuth = useCallback(() => {
    setState({
      walletAddress: null,
      username: null,
      isConnected: false,
      plate: null,
    });
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const setPlate = useCallback((plate: PlateAssociation | null) => {
    setState((prev) => ({ ...prev, plate }));
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, setAuth, clearAuth, setPlate }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
