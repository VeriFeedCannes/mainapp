"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { MiniKit } from "@worldcoin/minikit-js";

interface MiniKitContextType {
  isReady: boolean;
}

const MiniKitContext = createContext<MiniKitContextType>({ isReady: false });

export function MiniKitProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    MiniKit.install(process.env.NEXT_PUBLIC_APP_ID);

    const check = () => {
      if (MiniKit.isInstalled()) {
        setIsReady(true);
      }
    };

    check();
    const t1 = setTimeout(check, 300);
    const t2 = setTimeout(check, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <MiniKitContext.Provider value={{ isReady }}>
      {children}
    </MiniKitContext.Provider>
  );
}

export function useMiniKit() {
  return useContext(MiniKitContext);
}
