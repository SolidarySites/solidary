import {
  clearChildren,
  loadConfig,
  readStoredBridgeToken,
  renderLink,
  selectFromTable,
  setHref,
  setText
} from "./shared.js";

const renderConnectedSites = (container, connections) => {
  clearChildren(container);
  if (!container) return;

  if (!connections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No connected sites are stored for this index yet.";
    container.append(empty);
    return;
  }

  connections.forEach((connection) => {
    const article = document.createElement("article");
    article.className = "connected-site-card";

    const title = document.createElement("h3");
    title.textContent = connection.title || connection.siteId;
    article.append(title);

    if (connection.description) {
      const description = document.createElement("p");
      description.textContent = connection.description;
      article.append(description);
    }

    const meta = document.createElement("dl");
    meta.className = "connected-site-meta";
    [
      ["Site URL", connection.canonicalUrl || "-"],
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
      link.textContent = "Visit site";
      article.append(link);
    }

    container.append(article);
  });
};

const loadSiteState = async (config) => {
  const [archiveRows, archiveSiteRows] = await Promise.all([
    selectFromTable({
      config,
      table: "archives",
      select:
        "id,type,canonical_url,title,description,image_url,index_level,parent_index_id,parent_index_url,parent_index_level",
      filters: {
        id: `eq.${config.archiveId}`
      }
    }),
    selectFromTable({
      config,
      table: "archive_sites",
      select: "site_id,status,created_at,delist_reason_code,delist_note",
      filters: {
        archive_id: `eq.${config.archiveId}`,
        status: "eq.tracked"
      },
      order: {
        column: "created_at",
        ascending: false
      }
    })
  ]);

  const archive = Array.isArray(archiveRows) ? archiveRows[0] || null : null;
  const connectionSiteIds = Array.isArray(archiveSiteRows)
    ? archiveSiteRows
        .map((row) => (typeof row.site_id === "string" ? row.site_id : ""))
        .filter(Boolean)
    : [];

  let connectionSiteRows = [];
  if (connectionSiteIds.length) {
    connectionSiteRows = await selectFromTable({
      config,
      table: "sites",
      select:
        "id,canonical_url,title,description,image_url,parent_index_id,parent_index_url,parent_index_level",
      filters: {
        id: `in.(${connectionSiteIds.join(",")})`
      }
    });
  }

  const siteById = new Map((connectionSiteRows || []).map((entry) => [entry.id, entry]));
  const connections = (archiveSiteRows || []).map((entry) => {
    const connectedSite = siteById.get(entry.site_id) || {};
    return {
      siteId: entry.site_id,
      title: typeof connectedSite.title === "string" ? connectedSite.title : entry.site_id,
      description: typeof connectedSite.description === "string" ? connectedSite.description : "",
      canonicalUrl:
        typeof connectedSite.canonical_url === "string" ? connectedSite.canonical_url : "",
      parentIndexUrl:
        typeof connectedSite.parent_index_url === "string" ? connectedSite.parent_index_url : "",
      parentIndexLevel:
        typeof connectedSite.parent_index_level === "number"
          ? connectedSite.parent_index_level
          : null
    };
  });

  return {
    archive,
    connections
  };
};

const boot = async () => {
  try {
    const config = await loadConfig("./config/index.json");
    const { archive, connections } = await loadSiteState(config);
    const archiveTitle =
      (archive && typeof archive.title === "string" && archive.title) || config.title || "Solidary Index";
    const archiveDescription =
      (archive && typeof archive.description === "string" && archive.description) ||
      config.description ||
      "This standalone index is loading.";
    const siteUrl =
      (archive && typeof archive.canonical_url === "string" && archive.canonical_url) ||
      config.siteUrl ||
      "";

    document.title = `${archiveTitle} | Solidary Index`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute("content", archiveDescription);
    }

    setText("index-title", archiveTitle);
    setText("index-description", archiveDescription);
    setText("archive-slug", typeof config.slug === "string" ? config.slug : "");
    setText("archive-id", typeof config.archiveId === "string" ? config.archiveId : "");
    setText("project-ref", typeof config.projectRef === "string" ? config.projectRef : "");
    setText("project-url", typeof config.projectUrl === "string" ? config.projectUrl : "");
    setText(
      "index-level",
      archive && typeof archive.index_level === "number"
        ? String(archive.index_level)
        : typeof config.indexLevel === "number"
          ? String(config.indexLevel)
          : "-"
    );
    setText(
      "parent-index-url",
      archive && typeof archive.parent_index_url === "string" && archive.parent_index_url
        ? archive.parent_index_url
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

    const rememberedBridgeToken = readStoredBridgeToken(config.archiveId);
    const adminLink = document.getElementById("admin-link");
    if (adminLink) {
      if (rememberedBridgeToken) {
        adminLink.href = `./admin/?bridge=${encodeURIComponent(rememberedBridgeToken)}`;
      } else {
        adminLink.href = "./admin/";
      }
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
        href: rememberedBridgeToken
          ? `./admin/?bridge=${encodeURIComponent(rememberedBridgeToken)}`
          : "./admin/",
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
      "This standalone index is reading live data from its own Supabase project. Configure local OAuth before onboarding external admins directly."
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
