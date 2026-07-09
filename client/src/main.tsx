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

/**
 * If a stale service worker SPA-fallback served index.html for /.auth/*,
 * the React app boots on an Easy Auth URL and shows 404 while login.windows.net
 * is blocked as a cross-origin frame load. Unregister SW and hard-navigate once
 * so Easy Auth can 302 to Microsoft at the top level.
 */
async function recoverEasyAuthFromServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (!path.startsWith("/.auth")) return;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch {
    // continue to hard navigation anyway
  }
  const url = `${path}${window.location.search}`;
  window.location.replace(url);
}

void recoverEasyAuthFromServiceWorker();

// One-time purge of pre-denylist service workers (navigateFallback ate /.auth).
try {
  const FLAG = "jsqa_sw_auth_denylist_v1";
  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    !localStorage.getItem(FLAG)
  ) {
    void navigator.serviceWorker.getRegistrations().then(async regs => {
      await Promise.all(regs.map(r => r.unregister()));
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

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
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
