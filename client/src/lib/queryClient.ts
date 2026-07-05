import { QueryClient, QueryCache, QueryFunction } from "@tanstack/react-query";

export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const err = new Error(`${res.status}: ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

// Default queryFn convention:
//   queryKey: ["/api/path"]                       -> GET /api/path
//   queryKey: ["/api/path", id]                   -> GET /api/path/<id>
//   queryKey: ["/api/path", { foo: 1, bar: 2 }]   -> GET /api/path?foo=1&bar=2
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const [base, ...rest] = queryKey as [string, ...unknown[]];
    let url = base;
    for (const part of rest) {
      if (part == null) continue;
      if (typeof part === "object") {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(part as Record<string, unknown>)) {
          if (v != null) params.set(k, String(v));
        }
        const qs = params.toString();
        if (qs) url += (url.includes("?") ? "&" : "?") + qs;
      } else {
        url += `/${encodeURIComponent(String(part))}`;
      }
    }
    const res = await fetch(`${API_BASE}${url}`);
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if ((err as { status?: number })?.status === 401) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
