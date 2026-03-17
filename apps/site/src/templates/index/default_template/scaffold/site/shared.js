export const textById = (id) => document.getElementById(id);

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
  if (!href) {
    anchor.removeAttribute("href");
    anchor.textContent = "Unavailable";
    return;
  }
  anchor.href = href;
  anchor.textContent = label;
};

export const renderLink = (container, { href, label, primary = false }) => {
  if (!container || !href) return;
  const anchor = document.createElement("a");
  anchor.href = href;
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

export const getBridgeStorageKey = (archiveId) => `solidary-index-admin-bridge:${archiveId}`;
export const getLocalAdminStorageKey = (archiveId) => `solidary-index-admin-local:${archiveId}`;

export const rememberBridgeToken = ({ archiveId, token }) => {
  if (!archiveId || !token) return;
  window.sessionStorage.setItem(getBridgeStorageKey(archiveId), token);
};

export const readStoredBridgeToken = (archiveId) => {
  if (!archiveId) return "";
  return window.sessionStorage.getItem(getBridgeStorageKey(archiveId)) || "";
};

export const rememberLocalAdminToken = ({ archiveId, token }) => {
  if (!archiveId || !token) return;
  window.sessionStorage.setItem(getLocalAdminStorageKey(archiveId), token);
};

export const readStoredLocalAdminToken = (archiveId) => {
  if (!archiveId) return "";
  return window.sessionStorage.getItem(getLocalAdminStorageKey(archiveId)) || "";
};

export const clearStoredLocalAdminToken = (archiveId) => {
  if (!archiveId) return;
  window.sessionStorage.removeItem(getLocalAdminStorageKey(archiveId));
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
