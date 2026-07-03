import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { mockShellClient } from "./mock-shell-client.js";

export const withShellWebProviders: Decorator = (Story) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={mockShellClient}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </ShellClientContext.Provider>
    </QueryClientProvider>
  );
};
