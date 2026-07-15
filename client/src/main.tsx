import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
// Note: getLoginUrl removed - Azure Easy Auth handles redirects at ingress level
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { initAnalytics } from "./analytics";
import "./index.css";

// Initialize analytics if configured
initAnalytics();

// One-time purge of pre-denylist service workers (old NavigationRoute ate /.auth).
// Do NOT auto-navigate on /.auth/* — that caused login loops with Easy Auth.
try {
  const FLAG = "jsqa_sw_selection_marks_v8";
  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    !localStorage.getItem(FLAG)
  ) {
    void navigator.serviceWorker.getRegistrations().then(async regs => {
      await Promise.all(regs.map(r => r.unregister()));
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch {
        // ignore
      }
      localStorage.setItem(FLAG, "1");
    });
  }
} catch {
  // ignore
}

// Configure QueryClient with auth-resilient defaults
// Prevents React crashes (error #310) on auth failures
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on auth errors
      retry: (failureCount, error) => {
        if (error instanceof TRPCClientError) {
          // Never retry auth errors
          if (
            error.data?.code === "UNAUTHORIZED" ||
            error.message === UNAUTHED_ERR_MSG
          ) {
            return false;
          }
        }
        return failureCount < 3;
      },
      // Don't throw errors in React render - handle via isError
      throwOnError: false,
      // Prevent aggressive refetching when unauthed
      refetchOnWindowFocus: query => {
        // Skip refetch if the query has an auth error
        return query.state.error === null;
      },
    },
    mutations: {
      throwOnError: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Azure Easy Auth handles redirects at ingress level.
  // A 401 in production means the auth cookie expired - reload to trigger Azure redirect.
  // In dev mode, show error in console (no Azure Easy Auth available).
  if (import.meta.env.PROD) {
    console.log(
      "[Auth] Session expired, reloading to trigger Azure SSO redirect..."
    );
    window.location.reload();
  } else {
    console.warn(
      "[Auth] Unauthorized - set up local dev auth or use staging for SSO testing"
    );
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

let csrfToken: string | null = null;
let csrfTokenExpiresAt = 0;
let csrfTokenRequest: Promise<string | null> | null = null;

async function getCsrfToken(): Promise<string | null> {
  if (csrfToken && Date.now() < csrfTokenExpiresAt) {
    return csrfToken;
  }
  if (csrfTokenRequest) return csrfTokenRequest;

  csrfTokenRequest = globalThis
    .fetch("/api/csrf-token", {
      credentials: "include",
      cache: "no-store",
    })
    .then(async response => {
      if (!response.ok) return null;
      const body = (await response.json()) as { token?: unknown };
      if (typeof body.token !== "string") return null;

      csrfToken = body.token;
      // Tokens are valid for one hour; refresh early to avoid mid-session expiry.
      csrfTokenExpiresAt = Date.now() + 50 * 60 * 1000;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      csrfTokenRequest = null;
    });

  return csrfTokenRequest;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const request = init ?? {};
        const addCsrfToken = (request.method ?? "GET").toUpperCase() === "POST";

        return (async () => {
          const headers = new Headers(request.headers);
          if (addCsrfToken) {
            const token = await getCsrfToken();
            if (token) headers.set("x-csrf-token", token);
          }

          return globalThis.fetch(input, {
            ...request,
            headers,
            credentials: "include",
          });
        })();
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
