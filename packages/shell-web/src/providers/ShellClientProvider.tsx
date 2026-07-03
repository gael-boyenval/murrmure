import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { createShellClient, type ShellClient } from "@murrmure/shell-client";
import { getShellToken, resolveApiBaseUrl } from "../hooks.js";

const ShellClientContext = createContext<ShellClient | null>(null);

export { ShellClientContext };

export function ShellClientProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [token, setToken] = useState(() => getShellToken());

  useEffect(() => {
    setToken(getShellToken());
  }, [location.pathname, location.key]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "murrmure_token") {
        setToken(getShellToken());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const client = useMemo(() => {
    if (!token) return null;
    return createShellClient({ baseUrl: resolveApiBaseUrl(), token });
  }, [token]);

  return <ShellClientContext.Provider value={client}>{children}</ShellClientContext.Provider>;
}

export function useShellClient(): ShellClient | null {
  return useContext(ShellClientContext);
}
