import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const __SOLIDARY_PROJECT_ID__: string;
declare const __SOLIDARY_SUPABASE_URL__: string;
declare const __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__: string;

const readEnv = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const projectId = readEnv(__SOLIDARY_PROJECT_ID__);
const publishableKey = readEnv(__SOLIDARY_SUPABASE_PUBLISHABLE_KEY__);
const explicitSupabaseUrl = readEnv(__SOLIDARY_SUPABASE_URL__);
const supabaseUrl =
  explicitSupabaseUrl || (projectId ? `https://${projectId}.supabase.co` : "");
const supabasePublishableKey = publishableKey;

const stripProviderTokensFromStoredSession = (value: string) => {
  try {
    const payload = JSON.parse(value) as unknown;
    if (!payload || typeof payload !== "object") return value;
    const scrub = (entry: unknown): unknown => {
      if (!entry || typeof entry !== "object") return entry;
      if (Array.isArray(entry)) return entry.map(scrub);
      const next: Record<string, unknown> = {};
      Object.entries(entry as Record<string, unknown>).forEach(([key, child]) => {
        if (key === "provider_token" || key === "provider_refresh_token") return;
        next[key] = scrub(child);
      });
      return next;
    };
    return JSON.stringify(scrub(payload));
  } catch {
    return value;
  }
};

const createSafeAuthStorage = (): Storage | undefined => {
  if (typeof window === "undefined") return undefined;
  return {
    get length() {
      return window.localStorage.length;
    },
    clear() {
      window.localStorage.clear();
    },
    getItem(key: string) {
      return window.localStorage.getItem(key);
    },
    key(index: number) {
      return window.localStorage.key(index);
    },
    removeItem(key: string) {
      window.localStorage.removeItem(key);
    },
    setItem(key: string, value: string) {
      window.localStorage.setItem(key, stripProviderTokensFromStoredSession(value));
    }
  };
};

let supabaseClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  supabaseClient ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: createSafeAuthStorage()
    }
  });
  return supabaseClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, property, value, receiver) {
    return Reflect.set(getSupabaseClient(), property, value, receiver);
  }
});

const normalizeFunctionName = (value: string) =>
  value
    .trim()
    .replace(/^\/+/, "")
    .replace(/^functions\/v1\//, "")
    .replace(/^\.netlify\/functions\//, "")
    .replace(/^netlify\/functions\//, "")
    .replace(/^\/\.netlify\/functions\//, "");

export function supabaseFunctionUrl(functionName: string) {
  const normalizedName = normalizeFunctionName(functionName);
  if (!normalizedName) {
    throw new Error("Supabase function name is required.");
  }
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured.");
  }
  return `${supabaseUrl}/functions/v1/${normalizedName}`;
}
