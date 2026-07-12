export const textById = (id) => document.getElementById(id);

const safeHttpUrl = (value) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

export const clearChildren = (element) => {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

export const setText = (id, value) => {
  const element = textById(id);
  if (element) {
    element.textContent = value || "-";
  }
};

export const setHref = (id, href, label) => {
  const anchor = document.getElementById(id);
  if (!anchor) return;
  const safeHref = safeHttpUrl(href);
  if (!safeHref) {
    anchor.removeAttribute("href");
    anchor.textContent = "Unavailable";
    return;
  }
  anchor.href = safeHref;
  anchor.textContent = label;
};

export const renderLink = (container, { href, label, primary = false }) => {
  const safeHref = safeHttpUrl(href);
  if (!container || !safeHref) return;
  const anchor = document.createElement("a");
  anchor.href = safeHref;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.textContent = label;
  if (primary) {
    anchor.className = "primary-link";
  }
  container.append(anchor);
};

export const loadConfig = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load standalone index configuration.");
  }
  return response.json();
};

export const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
};

export const buildRestHeaders = (config) => ({
  apikey: config.publishableKey,
  Authorization: `Bearer ${config.publishableKey}`,
  Accept: "application/json"
});

export const selectFromTable = async ({
  config,
  table,
  select,
  filters = {},
  order
}) => {
  const url = new URL(`/rest/v1/${table}`, config.projectUrl);
  url.searchParams.set("select", select);
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  if (order?.column) {
    url.searchParams.set("order", `${order.column}.${order.ascending === false ? "desc" : "asc"}`);
  }
  return fetchJson(url.toString(), {
    headers: buildRestHeaders(config)
  });
};

export const callRestRpc = async ({
  config,
  rpcName,
  body = {}
}) => {
  const url = new URL(`/rest/v1/rpc/${rpcName}`, config.projectUrl);
  return fetchJson(url.toString(), {
    method: "POST",
    headers: {
      ...buildRestHeaders(config),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
};

export const callSupabaseFunction = async ({
  supabaseUrl,
  functionName,
  body,
  bridgeToken
}) => {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
  const headers = {
    "content-type": "application/json"
  };
  if (bridgeToken) {
    headers["x-index-admin-bridge"] = bridgeToken;
  }
  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
};

export const callParentFunction = async ({
  config,
  functionName,
  body,
  bridgeToken
}) =>
  callSupabaseFunction({
    supabaseUrl: config.solidarySupabaseUrl,
    functionName,
    body,
    bridgeToken
  });

export const callLocalFunction = async ({
  config,
  functionName,
  body,
  bridgeToken
}) =>
  callSupabaseFunction({
    supabaseUrl: config.projectUrl,
    functionName,
    body,
    bridgeToken
  });

export const normalizeDomainInput = (value) =>
  (value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();

export const getBridgeStorageKey = (indexId) => `solidary-index-admin-bridge:${indexId}`;
export const getLocalAdminStorageKey = (indexId) => `solidary-index-admin-local:${indexId}`;

export const rememberBridgeToken = ({ indexId, token }) => {
  if (!indexId || !token) return;
  window.sessionStorage.setItem(getBridgeStorageKey(indexId), token);
};

export const readStoredBridgeToken = (indexId) => {
  if (!indexId) return "";
  return window.sessionStorage.getItem(getBridgeStorageKey(indexId)) || "";
};

export const rememberLocalAdminToken = ({ indexId, token }) => {
  if (!indexId || !token) return;
  window.sessionStorage.setItem(getLocalAdminStorageKey(indexId), token);
};

export const readStoredLocalAdminToken = (indexId) => {
  if (!indexId) return "";
  return window.sessionStorage.getItem(getLocalAdminStorageKey(indexId)) || "";
};

export const clearStoredLocalAdminToken = (indexId) => {
  if (!indexId) return;
  window.sessionStorage.removeItem(getLocalAdminStorageKey(indexId));
};

export const extractBridgeTokenFromUrl = () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("bridge") || "";
  if (token) {
    url.searchParams.delete("bridge");
    window.history.replaceState({}, document.title, url.toString());
  }
  return token;
};
