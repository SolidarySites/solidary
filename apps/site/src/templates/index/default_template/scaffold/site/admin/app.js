import {
  callParentFunction,
  clearChildren,
  extractBridgeTokenFromUrl,
  loadConfig,
  normalizeDomainInput,
  readStoredBridgeToken,
  rememberBridgeToken,
  renderLink
} from "../shared.js";

const arrayBufferToBase64 = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
};

const state = {
  config: null,
  bridgeToken: "",
  adminState: null,
  setup: null,
  activeSection: "general",
  collaboratorSuggestions: [],
  selectedCollaborator: null,
  collaboratorRole: "editor",
  notice: null,
  noticeKind: "notice"
};

const byId = (id) => document.getElementById(id);

const setNotice = (message, kind = "notice") => {
  state.notice = message;
  state.noticeKind = kind;
  const card = byId("admin-notice-card");
  const text = byId("admin-notice-text");
  if (!card || !text) return;
  if (!message) {
    card.hidden = true;
    text.textContent = "";
    return;
  }
  card.hidden = false;
  card.dataset.kind = kind;
  text.textContent = message;
};

const renderHeroLinks = () => {
  const links = byId("admin-links");
  clearChildren(links);
  if (!links || !state.setup) return;
  renderLink(links, {
    href: state.setup.liveUrl,
    label: "Open live index",
    primary: true
  });
  renderLink(links, {
    href: state.setup.repoUrl,
    label: "GitHub repo"
  });
  renderLink(links, {
    href: state.setup.supabaseDashboardUrl,
    label: "Supabase project"
  });
  renderLink(links, {
    href: state.setup.solidaryAdminUrl,
    label: "Open Solidary /admin"
  });
};

const getOwner = () =>
  (state.adminState?.collaborators || []).find((entry) => entry.role === "owner") || null;

const getNonOwnerCollaborators = () =>
  (state.adminState?.collaborators || []).filter((entry) => entry.role !== "owner");

const renderTabs = () => {
  const tabs = byId("admin-tabs");
  clearChildren(tabs);
  if (!tabs) return;
  [
    ["general", "General"],
    ["connections", "Connections"],
    ["collaborators", "Collaborators"],
    ["advanced", "Advanced"]
  ].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `admin-tab-button ${state.activeSection === value ? "is-active" : ""}`.trim();
    button.textContent = label;
    button.addEventListener("click", () => {
      state.activeSection = value;
      renderPanel();
      renderTabs();
    });
    tabs.append(button);
  });
};

const renderGuard = (message, allowAdminLink = true) => {
  const guard = byId("admin-guard");
  const shell = byId("admin-shell");
  const text = byId("admin-guard-text");
  if (!guard || !shell || !text) return;
  guard.hidden = false;
  shell.hidden = true;
  text.textContent = message;

  guard.querySelectorAll(".hero-actions").forEach((element) => element.remove());

  if (allowAdminLink && state.config) {
    const actionRow = document.createElement("div");
    actionRow.className = "hero-actions";
    renderLink(actionRow, {
      href: `${state.config.solidaryAppUrl}/admin?archiveId=${state.config.archiveId}`,
      label: "Open Solidary /admin",
      primary: true
    });
    guard.append(actionRow);
  }
};

const renderGeneral = (panel) => {
  const archive = state.adminState.archive;
  const canEdit = Boolean(state.adminState.actor.canEditGeneral);
  panel.innerHTML = `
    <section class="admin-section">
      <div class="section-header">
        <h2>General</h2>
        <p>Update the standalone index title, description, and public metadata files.</p>
      </div>
      <label>
        Index title
        <input id="general-title" value="${archive.title || ""}" ${canEdit ? "" : "disabled"} />
      </label>
      <label>
        Description
        <textarea id="general-description" rows="4" ${canEdit ? "" : "disabled"}>${archive.description || ""}</textarea>
      </label>
      <label>
        Live URL
        <input value="${archive.canonicalUrl || ""}" readonly />
      </label>
      <label>
        Index image (JPEG)
        <input id="general-image" type="file" accept="image/jpeg" ${canEdit ? "" : "disabled"} />
      </label>
      <div class="hero-actions">
        <button class="primary-link button-link" id="general-save" ${canEdit ? "" : "disabled"}>Save</button>
      </div>
    </section>
  `;

  const saveButton = byId("general-save");
  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      try {
        const title = byId("general-title")?.value?.trim() || "";
        const description = byId("general-description")?.value?.trim() || "";
        const file = byId("general-image")?.files?.[0] || null;
        if (!title || !description) {
          throw new Error("Title and description are required.");
        }
        const payload = await callParentFunction({
          config: state.config,
          functionName: "index-admin-write",
          bridgeToken: state.bridgeToken,
          body: {
            archive_id: state.config.archiveId,
            action: "update_general",
            title,
            description,
            image_content_b64: file ? await arrayBufferToBase64(file) : undefined
          }
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        setNotice("General settings saved.");
        renderAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not save general settings.", "error");
      }
    });
  }
};

const renderConnections = (panel) => {
  const canManage = Boolean(state.adminState.actor.canManageConnections);
  const connections = state.adminState.connections || [];

  if (!connections.length) {
    panel.innerHTML = `
      <section class="admin-section">
        <div class="section-header">
          <h2>Connections</h2>
          <p>No connected sites are stored for this index yet.</p>
        </div>
      </section>
    `;
    return;
  }

  panel.innerHTML = "";
  const section = document.createElement("section");
  section.className = "admin-section";
  section.innerHTML = `
    <div class="section-header">
      <h2>Connections</h2>
      <p>Remove or restore site-to-index connections. Parent lineage metadata stays immutable.</p>
    </div>
  `;

  connections.forEach((connection) => {
    const card = document.createElement("article");
    card.className = "connected-site-card";
    card.innerHTML = `
      <h3>${connection.title || connection.siteId}</h3>
      ${connection.description ? `<p>${connection.description}</p>` : ""}
      <dl class="connected-site-meta">
        <div><dt>Status</dt><dd>${connection.status}</dd></div>
        <div><dt>Site URL</dt><dd>${connection.canonicalUrl || "-"}</dd></div>
        <div><dt>Parent index URL</dt><dd>${connection.parentIndexUrl || "-"}</dd></div>
      </dl>
      <div class="hero-actions">
        ${
          connection.canonicalUrl
            ? `<a href="${connection.canonicalUrl}" target="_blank" rel="noreferrer">Visit site</a>`
            : ""
        }
        <button class="button-link" data-site-id="${connection.siteId}" ${canManage ? "" : "disabled"}>
          ${connection.status === "tracked" ? "Disconnect" : "Reconnect"}
        </button>
      </div>
    `;

    const actionButton = card.querySelector("button[data-site-id]");
    if (actionButton) {
      actionButton.addEventListener("click", async () => {
        try {
          const payload = await callParentFunction({
            config: state.config,
            functionName: "index-admin-write",
            bridgeToken: state.bridgeToken,
            body: {
              archive_id: state.config.archiveId,
              action: "set_connection_status",
              site_id: connection.siteId,
              status: connection.status === "tracked" ? "delisted" : "tracked"
            }
          });
          state.adminState = payload.state;
          state.setup = payload.setup;
          setNotice("Connection state updated.");
          renderAll();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not update connection.", "error");
        }
      });
    }

    section.append(card);
  });

  panel.append(section);
};

const renderCollaboratorSuggestions = (container) => {
  clearChildren(container);
  (state.collaboratorSuggestions || []).forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "connected-site-card admin-suggestion";
    button.innerHTML = `
      <strong>${entry.displayName}</strong>
      <span>${entry.githubLogin ? `@${entry.githubLogin}` : entry.email}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedCollaborator = entry;
      const searchInput = byId("collaborator-query");
      if (searchInput) {
        searchInput.value = entry.displayName;
      }
    });
    container.append(button);
  });
};

const renderCollaborators = (panel) => {
  const canManage = Boolean(state.adminState.actor.canManageCollaborators);
  const owner = getOwner();
  const collaborators = getNonOwnerCollaborators();

  panel.innerHTML = `
    <section class="admin-section">
      <div class="section-header">
        <h2>Collaborators</h2>
        <p>Grant Solidary bridge access before the standalone index has local auth.</p>
      </div>
      ${
        owner
          ? `<article class="connected-site-card">
              <h3>${owner.displayName}</h3>
              <p>${owner.githubLogin ? `@${owner.githubLogin}` : owner.email}</p>
              <span class="eyebrow">Owner</span>
            </article>`
          : ""
      }
      <label>
        Solidary user
        <input id="collaborator-query" placeholder="Search by name, username, or email" ${
          canManage ? "" : "disabled"
        } />
      </label>
      <div id="collaborator-suggestions" class="connected-site-list"></div>
      <label>
        Access role
        <select id="collaborator-role" ${canManage ? "" : "disabled"}>
          <option value="contributor">Contributor</option>
          <option value="editor" selected>Editor</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <div class="hero-actions">
        <button class="primary-link button-link" id="collaborator-add" ${canManage ? "" : "disabled"}>
          Add collaborator
        </button>
      </div>
      <div class="connected-site-list" id="collaborator-list"></div>
    </section>
  `;

  const suggestions = byId("collaborator-suggestions");
  renderCollaboratorSuggestions(suggestions);

  const searchInput = byId("collaborator-query");
  if (searchInput) {
    let timeoutId = 0;
    searchInput.addEventListener("input", () => {
      state.selectedCollaborator = null;
      window.clearTimeout(timeoutId);
      const query = searchInput.value.trim();
      if (!query || query.length < 2) {
        state.collaboratorSuggestions = [];
        renderCollaboratorSuggestions(suggestions);
        return;
      }
      timeoutId = window.setTimeout(async () => {
        try {
          const payload = await callParentFunction({
            config: state.config,
            functionName: "index-admin-search-collaborators",
            bridgeToken: state.bridgeToken,
            body: {
              archive_id: state.config.archiveId,
              query
            }
          });
          state.collaboratorSuggestions = Array.isArray(payload.results) ? payload.results : [];
          renderCollaboratorSuggestions(suggestions);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not search collaborators.", "error");
        }
      }, 220);
    });
  }

  const roleSelect = byId("collaborator-role");
  if (roleSelect) {
    roleSelect.addEventListener("change", () => {
      state.collaboratorRole = roleSelect.value;
    });
  }

  const addButton = byId("collaborator-add");
  if (addButton) {
    addButton.addEventListener("click", async () => {
      try {
        if (!state.selectedCollaborator) {
          throw new Error("Select a Solidary user first.");
        }
        const payload = await callParentFunction({
          config: state.config,
          functionName: "index-admin-write",
          bridgeToken: state.bridgeToken,
          body: {
            archive_id: state.config.archiveId,
            action: "upsert_collaborator",
            collaborator_user_id: state.selectedCollaborator.userId,
            role: state.collaboratorRole
          }
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        state.collaboratorSuggestions = [];
        state.selectedCollaborator = null;
        setNotice("Collaborator updated.");
        renderAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not update collaborator.", "error");
      }
    });
  }

  const list = byId("collaborator-list");
  clearChildren(list);
  if (!list) return;

  collaborators.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "connected-site-card";
    card.innerHTML = `
      <h3>${entry.displayName}</h3>
      <p>${entry.githubLogin ? `@${entry.githubLogin}` : entry.email || entry.userId}</p>
      <div class="hero-actions">
        <select data-role-user="${entry.userId}" ${canManage ? "" : "disabled"}>
          <option value="contributor" ${entry.role === "contributor" ? "selected" : ""}>Contributor</option>
          <option value="editor" ${entry.role === "editor" ? "selected" : ""}>Editor</option>
          <option value="admin" ${entry.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
        <button class="button-link" data-remove-user="${entry.userId}" ${canManage ? "" : "disabled"}>
          Remove
        </button>
      </div>
    `;

    const roleControl = card.querySelector(`[data-role-user="${entry.userId}"]`);
    if (roleControl) {
      roleControl.addEventListener("change", async () => {
        try {
          const payload = await callParentFunction({
            config: state.config,
            functionName: "index-admin-write",
            bridgeToken: state.bridgeToken,
            body: {
              archive_id: state.config.archiveId,
              action: "upsert_collaborator",
              collaborator_user_id: entry.userId,
              role: roleControl.value
            }
          });
          state.adminState = payload.state;
          state.setup = payload.setup;
          setNotice("Collaborator role updated.");
          renderAll();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not update collaborator role.", "error");
        }
      });
    }

    const removeButton = card.querySelector(`[data-remove-user="${entry.userId}"]`);
    if (removeButton) {
      removeButton.addEventListener("click", async () => {
        try {
          const payload = await callParentFunction({
            config: state.config,
            functionName: "index-admin-write",
            bridgeToken: state.bridgeToken,
            body: {
              archive_id: state.config.archiveId,
              action: "remove_collaborator",
              collaborator_user_id: entry.userId
            }
          });
          state.adminState = payload.state;
          state.setup = payload.setup;
          setNotice("Collaborator removed.");
          renderAll();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not remove collaborator.", "error");
        }
      });
    }

    list.append(card);
  });
};

const renderAdvanced = (panel) => {
  const archive = state.adminState.archive;
  const canManage = Boolean(state.adminState.actor.canManageAdvanced);
  panel.innerHTML = `
    <section class="admin-section">
      <div class="section-header">
        <h2>Advanced</h2>
        <p>Manage custom domain settings and OAuth setup references for the standalone index.</p>
      </div>
      <label>
        Custom domain
        <input id="advanced-domain" value="${archive.canonicalUrl || ""}" ${canManage ? "" : "disabled"} />
      </label>
      <div class="hero-actions">
        <button class="primary-link button-link" id="advanced-save" ${canManage ? "" : "disabled"}>
          Connect domain
        </button>
        <button class="button-link" id="advanced-reset" ${canManage ? "" : "disabled"}>
          Reset to GitHub Pages
        </button>
      </div>
      <dl class="connected-site-meta">
        <div><dt>Site URL</dt><dd>${state.setup?.liveUrl || archive.canonicalUrl || "-"}</dd></div>
        <div><dt>Auth callback URL</dt><dd>${state.setup?.authCallbackUrl || "-"}</dd></div>
        <div><dt>Provider settings</dt><dd>${state.setup?.authProvidersDashboardUrl || "-"}</dd></div>
      </dl>
    </section>
  `;

  const saveButton = byId("advanced-save");
  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      try {
        const domain = normalizeDomainInput(byId("advanced-domain")?.value || "");
        if (!domain) {
          throw new Error("Enter a domain first, or use reset to go back to GitHub Pages.");
        }
        const payload = await callParentFunction({
          config: state.config,
          functionName: "index-admin-write",
          bridgeToken: state.bridgeToken,
          body: {
            archive_id: state.config.archiveId,
            action: "update_advanced",
            domain
          }
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        setNotice("Custom domain updated.");
        renderAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not update custom domain.", "error");
      }
    });
  }

  const resetButton = byId("advanced-reset");
  if (resetButton) {
    resetButton.addEventListener("click", async () => {
      try {
        const payload = await callParentFunction({
          config: state.config,
          functionName: "index-admin-write",
          bridgeToken: state.bridgeToken,
          body: {
            archive_id: state.config.archiveId,
            action: "update_advanced",
            domain: null
          }
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        setNotice("Reset back to the GitHub Pages URL.");
        renderAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not reset the custom domain.", "error");
      }
    });
  }
};

const renderPanel = () => {
  const panel = byId("admin-panel");
  if (!panel || !state.adminState) return;
  clearChildren(panel);

  if (state.activeSection === "general") {
    renderGeneral(panel);
    return;
  }
  if (state.activeSection === "connections") {
    renderConnections(panel);
    return;
  }
  if (state.activeSection === "collaborators") {
    renderCollaborators(panel);
    return;
  }
  renderAdvanced(panel);
};

const renderAll = () => {
  if (!state.adminState) return;
  byId("admin-title").textContent = state.adminState.archive.title || "Standalone index admin";
  renderHeroLinks();
  renderTabs();
  renderPanel();
  setNotice(state.notice, state.noticeKind);
  byId("admin-guard").hidden = true;
  byId("admin-shell").hidden = false;
};

const boot = async () => {
  try {
    state.config = await loadConfig("../config/index.json");
    state.bridgeToken =
      extractBridgeTokenFromUrl() || readStoredBridgeToken(state.config.archiveId) || "";
    if (state.bridgeToken) {
      rememberBridgeToken({
        archiveId: state.config.archiveId,
        token: state.bridgeToken
      });
    }

    if (!state.bridgeToken) {
      renderGuard(
        "This standalone /admin needs a bridge token. Open it from Solidary /admin until the standalone index has its own local auth."
      );
      return;
    }

    const payload = await callParentFunction({
      config: state.config,
      functionName: "index-admin-read",
      bridgeToken: state.bridgeToken,
      body: {
        archive_id: state.config.archiveId
      }
    });
    state.adminState = payload.state;
    state.setup = payload.setup;
    renderAll();
  } catch (error) {
    renderGuard(
      error instanceof Error
        ? error.message
        : "Could not load the standalone admin bridge."
    );
    setNotice(
      error instanceof Error ? error.message : "Could not load the standalone admin bridge.",
      "error"
    );
  }
};

void boot();
