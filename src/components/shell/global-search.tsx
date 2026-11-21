"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FolderKanban,
  Search,
  Users,
  BriefcaseBusiness,
  ListTodo,
  Layers3,
  Building2,
  Command,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

type SearchType =
  | "person"
  | "project"
  | "task"
  | "report"
  | "workspace"
  | "team"
  | "workstream";

type SearchItem = {
  id: string;
  type: SearchType;
  title: string;
  subtitle: string;
  href: string;
};

const icons = {
  person: Users,
  project: FolderKanban,
  task: ListTodo,
  report: FileText,
  workspace: Building2,
  team: BriefcaseBusiness,
  workstream: Layers3,
} satisfies Record<SearchType, LucideIcon>;

const labels: Record<SearchType, string> = {
  person: "People",
  project: "Projects",
  task: "Tasks",
  report: "Reports",
  workspace: "Workspaces",
  team: "Teams",
  workstream: "Workstreams",
};

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Close search and reset its state.
  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setItems([]);
    setLoading(false);
    setError("");
  }, []);

  // Keyboard shortcut: Ctrl + K / Cmd + K.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();

        if (open) {
          closeSearch();
        } else {
          setOpen(true);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeSearch]);

  // Automatically focus the search input when opened.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // Search records with a debounce and request cancellation.
  useEffect(() => {
    const normalized = query.trim();

    if (!open || normalized.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setLoading(true);

      void (async () => {
        try {
          const response = await fetch(
            `/api/search?q=${encodeURIComponent(normalized)}`,
            {
              credentials: "same-origin",
              signal: controller.signal,
            }
          );

          const json = (await response.json()) as {
            data?: {
              items?: SearchItem[];
            };
            error?: {
              message?: string;
            };
          };

          if (!response.ok) {
            throw new Error(
              json.error?.message ??
              "Search is unavailable right now."
            );
          }

          setItems(json.data?.items ?? []);
          setError("");
        } catch (err) {
          if (
            err instanceof DOMException &&
            err.name === "AbortError"
          ) {
            return;
          }

          setError(
            err instanceof Error
              ? err.message
              : "Search is unavailable right now."
          );
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  // Group search results by record type.
  const grouped = useMemo(() => {
    const groups = new Map<SearchType, SearchItem[]>();

    for (const item of items) {
      const existing = groups.get(item.type) ?? [];
      groups.set(item.type, [...existing, item]);
    }

    return [...groups.entries()];
  }, [items]);

  // Update search query and clear stale results.
  const handleQueryChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setQuery(event.target.value);
    setItems([]);
    setError("");
    setLoading(false);
  };

  // Navigate to the selected record.
  const navigate = (href: string) => {
    closeSearch();
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-fg-2 hover:border-line-strong hover:text-fg"
        aria-label="Open global search (Ctrl or Command plus K)"
      >
        <Search className="size-[18px] shrink-0" />

        <span className="hidden text-xs sm:inline">
          Search
        </span>

        <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-3 lg:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog
        open={open}
        onClose={closeSearch}
        title="Search Inhub Workspace"
        description="Find people, projects, tasks, reports, workspaces and teams."
        size="lg"
      >
        <div className="grid gap-4">
          {/* Search input */}
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />

            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              placeholder="Type at least 2 characters..."
              className="h-11 w-full rounded-[var(--radius-control)] border border-line bg-canvas pr-3 pl-10 text-sm outline-none focus:border-line-strong"
              autoComplete="off"
            />
          </label>

          {/* Loading */}
          {loading && (
            <p className="py-4 text-center text-sm text-fg-3">
              Searching…
            </p>
          )}

          {/* Error */}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-danger-soft p-3 text-sm text-danger"
            >
              {error}
            </p>
          )}

          {/* Initial state */}
          {!loading &&
            !error &&
            query.trim().length < 2 && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-fg-3">
                <Command className="size-4" />
                Start typing to search across your workspace.
              </div>
            )}

          {/* Empty state */}
          {!loading &&
            !error &&
            query.trim().length >= 2 &&
            items.length === 0 && (
              <p className="py-8 text-center text-sm text-fg-3">
                No matching records found.
              </p>
            )}

          {/* Grouped search results */}
          {grouped.map(([type, records]) => {
            const Icon = icons[type];

            return (
              <section key={type} className="grid gap-1">
                <h3 className="eyebrow px-1">
                  {labels[type]}
                </h3>

                {records.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.href)}
                    className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-2">
                      <Icon className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {item.title}
                      </span>

                      <span className="block truncate text-xs text-fg-3">
                        {item.subtitle}
                      </span>
                    </span>

                    <span className="shrink-0 text-[11px] text-fg-3">
                      Open
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}