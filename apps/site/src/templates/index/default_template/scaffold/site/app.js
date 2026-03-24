import {
  callLocalFunction,
  clearChildren,
  loadConfig,
  renderLink,
  setHref,
  setText
} from "./shared.js";

const toTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

const getUpdatedAtTimestamp = (value) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const compareNetworkNodes = (left, right) => {
  const leftUpdatedAt = getUpdatedAtTimestamp(left.updatedAt);
  const rightUpdatedAt = getUpdatedAtTimestamp(right.updatedAt);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt > leftUpdatedAt ? 1 : -1;
  }

  if (left.connectionCount !== right.connectionCount) {
    return right.connectionCount - left.connectionCount;
  }

  return left.title.localeCompare(right.title);
};

const renderConnectedSites = (container, connections) => {
  clearChildren(container);
  if (!container) return;

  if (!connections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No mirrored sites or indexes are visible from this index yet.";
    container.append(empty);
    return;
  }

  connections.forEach((connection) => {
    const article = document.createElement("article");
    article.className = "connected-site-card";

    const badge = document.createElement("p");
    badge.className = "connected-site-badge";
    badge.textContent = connection.nodeType === "index" ? "Index" : "Site";
    article.append(badge);

    const title = document.createElement("h3");
    title.textContent = connection.title || connection.nodeId;
    article.append(title);

    if (connection.description) {
      const description = document.createElement("p");
      description.textContent = connection.description;
      article.append(description);
    }

    const meta = document.createElement("dl");
    meta.className = "connected-site-meta";
    [
      ["Public URL", connection.canonicalUrl || "-"],
      ["Connections", String(connection.connectionCount)],
      ["Parent index URL", connection.parentIndexUrl || "-"],
      [
        "Parent index level",
        typeof connection.parentIndexLevel === "number" ? String(connection.parentIndexLevel) : "-"
      ]
    ].forEach(([label, value]) => {
      const wrapper = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrapper.append(dt, dd);
      meta.append(wrapper);
    });
    article.append(meta);

    if (connection.canonicalUrl) {
      const link = document.createElement("a");
      link.href = connection.canonicalUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = connection.nodeType === "index" ? "Visit index" : "Visit site";
      article.append(link);
    }

    container.append(article);
  });
};

const loadSiteState = async (config) => {
  const graph = await callLocalFunction({
    config,
    functionName: "index-public-network",
    body: {}
  });
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  const edgeCounts = {};
  rawEdges.forEach((edge) => {
    const sourceId = toTrimmedString(edge?.source_id);
    const targetId = toTrimmedString(edge?.target_id);
    if (!sourceId || !targetId || sourceId === targetId) return;
    edgeCounts[sourceId] = (edgeCounts[sourceId] || 0) + 1;
    edgeCounts[targetId] = (edgeCounts[targetId] || 0) + 1;
  });

  const index = rawNodes.find((node) => toTrimmedString(node?.id) === config.indexId) || null;
  const connections = rawNodes
    .map((node) => {
      const nodeId = toTrimmedString(node?.id);
      const canonicalUrl = toTrimmedString(node?.canonical_url);
      if (!nodeId || nodeId === config.indexId || !canonicalUrl) {
        return null;
      }

      const nodeType = toTrimmedString(node?.node_type) === "index" ? "index" : "site";
      return {
        nodeId,
        nodeType,
        title: toTrimmedString(node?.title) || (nodeType === "index" ? "Untitled index" : "Untitled site"),
        description: toTrimmedString(node?.description),
        canonicalUrl,
        parentIndexUrl: toTrimmedString(node?.parent_index_url),
        parentIndexLevel:
          typeof node?.parent_index_level === "number" ? node.parent_index_level : null,
        connectionCount: edgeCounts[nodeId] || 0,
        updatedAt: toTrimmedString(node?.updated_at) || null
      };
    })
    .filter(Boolean)
    .sort(compareNetworkNodes);

  return {
    index,
    connections
  };
};

const boot = async () => {
  try {
    const config = await loadConfig("./config/index.json");
    const { index, connections } = await loadSiteState(config);
    const indexTitle =
      (index && typeof index.title === "string" && index.title) || config.title || "Solidary Index";
    const indexDescription =
      (index && typeof index.description === "string" && index.description) ||
      config.description ||
      "This standalone index is loading.";
    const siteUrl =
      (index && typeof index.canonical_url === "string" && index.canonical_url) ||
      config.siteUrl ||
      "";

    document.title = `${indexTitle} | Solidary Index`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute("content", indexDescription);
    }

    setText("index-title", indexTitle);
    setText("index-description", indexDescription);
    setText("index-slug", typeof config.slug === "string" ? config.slug : "");
    setText("index-id", typeof config.indexId === "string" ? config.indexId : "");
    setText("project-ref", typeof config.projectRef === "string" ? config.projectRef : "");
    setText("project-url", typeof config.projectUrl === "string" ? config.projectUrl : "");
    setText(
      "index-level",
      index && typeof index.index_level === "number"
        ? String(index.index_level)
        : typeof config.indexLevel === "number"
          ? String(config.indexLevel)
          : "-"
    );
    setText(
      "parent-index-url",
      index && typeof index.parent_index_url === "string" && index.parent_index_url
        ? index.parent_index_url
        : typeof config.parentIndexUrl === "string"
          ? config.parentIndexUrl
          : ""
    );
    setText(
      "auth-callback-url",
      typeof config.authCallbackUrl === "string" ? config.authCallbackUrl : ""
    );

    setHref("repo-link", typeof config.repoUrl === "string" ? config.repoUrl : "", "Open repository");
    setHref(
      "supabase-link",
      typeof config.projectDashboardUrl === "string" ? config.projectDashboardUrl : "",
      "Open project"
    );

    const adminLink = document.getElementById("admin-link");
    if (adminLink) {
      adminLink.href = "./admin/";
    }

    const heroActions = document.getElementById("hero-actions");
    if (heroActions) {
      clearChildren(heroActions);
      renderLink(heroActions, {
        href: siteUrl || window.location.href,
        label: "Open live index",
        primary: true
      });
      renderLink(heroActions, {
        href: "./admin/",
        label: "Open /admin"
      });
      renderLink(heroActions, {
        href: typeof config.repoUrl === "string" ? config.repoUrl : "",
        label: "GitHub repo"
      });
      renderLink(heroActions, {
        href: typeof config.projectDashboardUrl === "string" ? config.projectDashboardUrl : "",
        label: "Supabase project"
      });
    }

    setText(
      "runtime-status",
      "This standalone index is reading the mirrored public network from its own Supabase project."
    );

    renderConnectedSites(document.getElementById("connected-site-list"), connections);
  } catch (error) {
    setText(
      "runtime-status",
      error instanceof Error ? error.message : "Could not load standalone index state."
    );
  }
};

void boot();
