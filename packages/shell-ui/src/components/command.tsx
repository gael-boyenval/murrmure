import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/utils.js";

/** Default placeholder for shell command palette — multi-entity navigation hint. */
export const COMMAND_SEARCH_PLACEHOLDER = "Search flows, spaces, sessions…";

type CommandContextValue = {
  search: string;
  setSearch: (search: string) => void;
  registerItem: (id: string, value: string) => void;
  unregisterItem: (id: string) => void;
  matchingCount: number;
};

const CommandContext = React.createContext<CommandContextValue | null>(null);

function useCommandContext(): CommandContextValue {
  const context = React.useContext(CommandContext);
  if (!context) {
    throw new Error("Command components must be used within Command");
  }
  return context;
}

function itemMatchesSearch(search: string, value: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return value.toLowerCase().includes(query);
}

function searchValueFromChildren(value: string | undefined, children: React.ReactNode): string {
  if (value !== undefined) return value;
  if (typeof children === "string") return children;
  return "";
}

export function Command({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState<Map<string, string>>(() => new Map());

  const registerItem = React.useCallback((id: string, value: string) => {
    setItems((previous) => {
      if (previous.get(id) === value) return previous;
      const next = new Map(previous);
      next.set(id, value);
      return next;
    });
  }, []);

  const unregisterItem = React.useCallback((id: string) => {
    setItems((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }, []);

  const matchingCount = React.useMemo(() => {
    let count = 0;
    for (const value of items.values()) {
      if (itemMatchesSearch(search, value)) count++;
    }
    return count;
  }, [search, items]);

  const contextValue = React.useMemo(
    () => ({ search, setSearch, registerItem, unregisterItem, matchingCount }),
    [search, registerItem, unregisterItem, matchingCount],
  );

  return (
    <CommandContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card",
          className,
        )}
        {...props}
      />
    </CommandContext.Provider>
  );
}

export function CommandInput({
  className,
  value,
  onChange,
  placeholder = COMMAND_SEARCH_PLACEHOLDER,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const { search, setSearch } = useCommandContext();

  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        className={cn(
          "flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground",
          className,
        )}
        value={value ?? search}
        placeholder={placeholder}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange?.(event);
        }}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("max-h-72 overflow-y-auto p-2", className)} {...props} />;
}

export function CommandGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden p-1", className)} {...props} />;
}

export function CommandItem({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value?: string }) {
  const id = React.useId();
  const { search, registerItem, unregisterItem } = useCommandContext();
  const searchValue = searchValueFromChildren(value, children);

  React.useEffect(() => {
    registerItem(id, searchValue);
    return () => unregisterItem(id);
  }, [id, searchValue, registerItem, unregisterItem]);

  if (!itemMatchesSearch(search, searchValue)) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandEmpty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { search, matchingCount } = useCommandContext();
  const showEmpty = search.trim().length > 0 && matchingCount === 0;

  if (!showEmpty) {
    return null;
  }

  return (
    <div className={cn("py-6 text-center text-sm text-muted-foreground", className)} {...props} />
  );
}
