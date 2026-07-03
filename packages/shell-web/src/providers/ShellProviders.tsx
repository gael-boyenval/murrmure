import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ShellClientProvider } from "./ShellClientProvider.js";
import { JournalProvider } from "./JournalProvider.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function ShellProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ShellClientProvider>
        <JournalProvider>{children}</JournalProvider>
      </ShellClientProvider>
    </QueryClientProvider>
  );
}
