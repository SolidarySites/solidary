import {
  callLocalFunction,
  callParentFunction,
  clearChildren,
  clearStoredLocalAdminToken,
  extractBridgeTokenFromUrl,
  loadConfig,
  normalizeDomainInput,
  readStoredBridgeToken,
  readStoredLocalAdminToken,
  rememberBridgeToken,
  rememberLocalAdminToken,
} from "../shared.js";

const FINALIZATION_POLL_INTERVAL_MS = 2500;
const FINALIZATION_CONFIRMATION_MESSAGE =
  "Finalise this index now? This copies the parent index app into the child repo and overwrites the managed app files.";
const FINALIZATION_SOURCE_STATUS_LABELS = {
  child_lineage: "Stored on child index",
  solidary_lineage: "Recovered from Solidary",
  root_fallback: "Solidary root fallback",
  missing: "Missing lineage",
};
const FUNCTIONS_DEPLOY_STATUS_LABELS = {
  not_ready: "Not ready",
  needs_secrets: "Needs repo secrets",
  ready_to_run: "Ready to deploy",
  running: "Workflow running",
  failed: "Workflow failed",
  deployed: "Deployment complete",
  unknown: "Status unavailable",
};

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
  adminMode: "bridge",
  adminState: null,
  setup: null,
  activeSection: "general",
  collaboratorSuggestions: [],
  selectedCollaborator: null,
  collaboratorRole: "editor",
  notice: null,
  noticeKind: "notice",
  finalizationStarting: false,
  finalizationPollHandle: 0,
  localAdminAvailable: false,
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

const applyPayload = (payload) => {
  state.adminState = payload?.state || null;
  state.setup = payload?.setup || null;
};

const clearFinalizationPoll = () => {
  if (state.finalizationPollHandle) {
    window.clearTimeout(state.finalizationPollHandle);
    state.finalizationPollHandle = 0;
  }
};

const callAdminFunction = async ({ functionName, body, bridgeToken = state.bridgeToken }) =>
  state.adminMode === "local"
    ? callLocalFunction({
      config: state.config,
      functionName,
      bridgeToken,
      body,
    })
    : callParentFunction({
      config: state.config,
      functionName,
      bridgeToken,
      body,
    });

const readAdminState = async () =>
  callAdminFunction({
    functionName: "index-admin-read",
    body: {
      index_id: state.config.indexId,
    },
  });

const probeLocalAdminAvailability = async () => {
  try {
    await callLocalFunction({
      config: state.config,
      functionName: "index-admin-password-login",
      body: {
        index_id: state.config.indexId,
        password: "",
      },
    });
    return {
      available: true,
      message: "Enter the local admin password to continue.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      /Enter the admin password/i.test(message) ||
      /Incorrect admin password/i.test(message) ||
      /Local admin password is not configured/i.test(message)
    ) {
      return {
        available: true,
        message: message || "Enter the local admin password to continue.",
      };
    }
    return {
      available: false,
      message: "",
    };
  }
};

const unlockLocalAdmin = async (password) => {
  const payload = await callLocalFunction({
    config: state.config,
    functionName: "index-admin-password-login",
    body: {
      index_id: state.config.indexId,
      password,
    },
  });
  const token = typeof payload?.token === "string" ? payload.token : "";
  if (!token) {
    throw new Error("Local admin login did not return a token.");
  }
  rememberLocalAdminToken({
    indexId: state.config.indexId,
    token,
  });
  state.bridgeToken = token;
  state.adminMode = "local";
  return token;
};

const renderHeroLinks = () => {
  const links = byId("admin-links");
  clearChildren(links);
  if (!links || !state.setup) return;
  renderLink(links, {
    href: state.setup.liveUrl,
    label: "Open live index",
    primary: true,
  });
  renderLink(links, {
    href: state.setup.repoUrl,
    label: "GitHub repo",
  });
  renderLink(links, {
    href: state.setup.supabaseDashboardUrl,
    label: "Supabase project",
  });
};

const getOwner = () =>
  (state.adminState?.collaborators || []).find((entry) =>
    entry.role === "owner"
  ) || null;

const getNonOwnerCollaborators = () =>
  (state.adminState?.collaborators || []).filter((entry) =>
    entry.role !== "owner"
  );

const buildWorkflowRunSummaryMarkup = (latestRun) => {
  if (!latestRun) {
    return "";
  }

  return `
    <div class="details-card">
      <h3>Latest workflow run</h3>
      <dl class="details-list">
        <div>
          <dt>Run status</dt>
          <dd>${latestRun.status || "unknown"}${
    latestRun.conclusion ? ` / ${latestRun.conclusion}` : ""
  }</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>${latestRun.updatedAt || "-"}</dd>
        </div>
        ${(latestRun.jobs || [])
    .map(
      (job) => `<div>
              <dt>${job.name}</dt>
              <dd>${job.status || "unknown"}${
        job.conclusion ? ` / ${job.conclusion}` : ""
      }${
        job.steps?.length
          ? ` - ${
            job.steps
              .map(
                (step) =>
                  `${step.name}: ${step.status || "unknown"}${
                    step.conclusion ? ` (${step.conclusion})` : ""
                  }`,
              )
              .join(" | ")
          }`
          : ""
      }</dd>
            </div>`,
    )
    .join("")}
      </dl>
    </div>
  `;
};

const renderTabs = () => {
  const tabs = byId("admin-tabs");
  clearChildren(tabs);
  if (!tabs) return;
  [
    ["general", "General"],
    ["connections", "Connections"],
    ["collaborators", "Collaborators"],
    ["advanced", "Advanced"],
  ].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `admin-tab-button ${
      state.activeSection === value ? "is-active" : ""
    }`.trim();
    button.textContent = label;
    button.addEventListener("click", () => {
      state.activeSection = value;
      renderPanel();
      renderTabs();
    });
    tabs.append(button);
  });
};

const renderGuard = ({ message, showLocalPasswordForm = false }) => {
  const guard = byId("admin-guard");
  const shell = byId("admin-shell");
  const finalizationCard = byId("admin-finalization");
  const text = byId("admin-guard-text");
  if (!guard || !shell || !text) return;
  clearFinalizationPoll();
  guard.hidden = false;
  shell.hidden = true;
  if (finalizationCard) {
    finalizationCard.hidden = true;
    finalizationCard.innerHTML = "";
  }
  text.textContent = message;

  guard.querySelectorAll(".hero-actions").forEach((element) =>
    element.remove()
  );

  if (showLocalPasswordForm) {
    const form = document.createElement("form");
    form.className = "admin-section";
    form.innerHTML = `
      <label>
        Admin password
        <input id="local-admin-password" type="password" autocomplete="current-password" />
      </label>
      <div class="hero-actions">
        <button type="submit" class="primary-link button-link">Unlock /admin</button>
      </div>
    `;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = byId("local-admin-password")?.value?.trim() || "";
      if (!password) {
        setNotice("Enter the admin password to continue.", "error");
        return;
      }

      try {
        await unlockLocalAdmin(password);
        const payload = await readAdminState();
        applyPayload(payload);
        setNotice("Local admin unlocked.");
        renderAll();
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Could not unlock local admin.",
          "error",
        );
      }
    });
    guard.append(form);
  }
};

const renderFinalizationCard = () => {
  const card = byId("admin-finalization");
  const finalization = state.setup?.finalization;
  if (!card) {
    return;
  }
  if (!finalization) {
    card.hidden = true;
    card.innerHTML = "";
    return;
  }

  const sourceRepoLabel = finalization.sourceRepoFullName ||
    finalization.sourceRepoUrl || "-";
  const functionsReady = finalization.functionsDeployStatus === "deployed";
  const showFunctionsSetup = finalization.isFinalized && !functionsReady;
  const latestWorkflowRunMarkup = buildWorkflowRunSummaryMarkup(
    state.setup?.functionsDeployment?.latestRun,
  );
  const heading = !finalization.isFinalized
    ? "Finalise Index"
    : functionsReady
    ? "Standalone app ready"
    : "Finalize Index Setup";
  const lead = !finalization.isFinalized
    ? "Once standalone auth is working, copy the parent index app into this child repo."
    : functionsReady
    ? "The child repo now runs its own Search, Explorer, Studio, and Edge Functions."
    : "The child repo has been copied. Add the required repo secrets and run the Deploy workflow to make the copied runtime operational.";
  card.hidden = false;
  card.innerHTML = `
    <div class="details-head">
      <h2>${heading}</h2>
      <p>${lead}</p>
    </div>
    <dl class="details-list">
      <div>
        <dt>Status</dt>
        <dd>${finalization.status || "idle"}</dd>
      </div>
      <div>
        <dt>Step</dt>
        <dd>${finalization.step || "-"}</dd>
      </div>
      <div>
        <dt>Deploy workflow</dt>
        <dd>${
    FUNCTIONS_DEPLOY_STATUS_LABELS[finalization.functionsDeployStatus] ||
    "Not ready"
  }</dd>
      </div>
      <div>
        <dt>Source repo</dt>
        <dd>${
    finalization.sourceRepoUrl
      ? `<a href="${finalization.sourceRepoUrl}" target="_blank" rel="noreferrer">${sourceRepoLabel}</a>`
      : sourceRepoLabel
  }</dd>
      </div>
      <div>
        <dt>Source status</dt>
        <dd>${
    FINALIZATION_SOURCE_STATUS_LABELS[finalization.sourceRepoStatus] ||
    "Missing lineage"
  }</dd>
      </div>
      ${
    finalization.sourceRepoMessage
      ? `<div><dt>Source note</dt><dd>${finalization.sourceRepoMessage}</dd></div>`
      : ""
  }
      ${
    finalization.functionsDeployMessage
      ? `<div><dt>Deploy note</dt><dd>${finalization.functionsDeployMessage}</dd></div>`
      : ""
  }
      <div>
        <dt>Completed</dt>
        <dd>${finalization.completedAt || "-"}</dd>
      </div>
      ${
    finalization.error
      ? `<div><dt>Latest error</dt><dd>${finalization.error}</dd></div>`
      : ""
  }
    </dl>
    ${
    showFunctionsSetup
      ? `<div class="details-card">
            <h3>Required repo secrets</h3>
            <dl class="details-list">
              ${
        (finalization.requiredRepoSecrets || [])
          .map(
            (secret) =>
              `<div>
                    <dt>${secret.name}</dt>
                    <dd>${secret.isConfigured ? "Configured" : "Missing"}${
                secret.value ? ` — ${secret.value}` : ""
              }${secret.description ? ` — ${secret.description}` : ""}</dd>
                  </div>`,
          )
          .join("")
      }
            </dl>
          </div>`
      : ""
  }
    ${latestWorkflowRunMarkup}
    ${
    finalization.isFinalized && Array.isArray(state.setup?.nextSteps) &&
      state.setup.nextSteps.length
      ? `<div class="details-card">
            <h3>Next steps</h3>
            <ol class="details-steps">
              ${
        state.setup.nextSteps.map((step) => `<li>${step}</li>`).join("")
      }
            </ol>
          </div>`
      : ""
  }
    <div class="hero-actions" id="admin-finalization-actions"></div>
  `;

  const actions = byId("admin-finalization-actions");
  if (!actions) {
    return;
  }

  if (!finalization.isFinalized) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button-link primary-link";
    button.textContent = state.finalizationStarting || finalization.isRunning
      ? "Finalising..."
      : "Finalise Index";
    button.disabled = !finalization.available || finalization.isRunning ||
      state.finalizationStarting;
    button.addEventListener("click", async () => {
      const confirmed = window.confirm(FINALIZATION_CONFIRMATION_MESSAGE);
      if (!confirmed) {
        return;
      }

      try {
        state.finalizationStarting = true;
        renderFinalizationCard();
        const payload = await callAdminFunction({
          functionName: "index-admin-write",
          body: {
            index_id: state.config.indexId,
            action: "finalize_index",
          },
        });
        applyPayload(payload);
        setNotice(
          "Index finalization started. This page will keep refreshing until the copy finishes.",
        );
        renderAll();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not start index finalization.",
          "error",
        );
      } finally {
        state.finalizationStarting = false;
        renderFinalizationCard();
      }
    });
    actions.append(button);
    return;
  }

  if (showFunctionsSetup) {
    renderLink(actions, {
      href: finalization.functionsDeployWorkflowUrl,
      label: "Open Deploy workflow",
      primary: true,
    });
    renderLink(actions, {
      href: finalization.functionsDeployRunUrl,
      label: "Open latest workflow run",
    });
    return;
  }

  [
    [state.setup?.standaloneAdminUrl, "Open child /admin"],
    [finalization.targetSearchUrl, "Open Search"],
    [finalization.targetExplorerUrl, "Open Explorer"],
    [finalization.targetStudioUrl, "Open Studio"],
  ].forEach(([href, label]) => {
    renderLink(actions, {
      href,
      label,
    });
  });
};

const scheduleFinalizationPoll = () => {
  clearFinalizationPoll();
  if (
    !state.setup?.finalization?.isRunning &&
    state.setup?.functionsDeployment?.status !== "running"
  ) {
    return;
  }

  state.finalizationPollHandle = window.setTimeout(async () => {
    try {
      const payload = await readAdminState();
      applyPayload(payload);
      renderAll();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not refresh finalization status.",
        "error",
      );
    }
  }, FINALIZATION_POLL_INTERVAL_MS);
};

const renderGeneral = (panel) => {
  const index = state.adminState.index;
  const canEdit = Boolean(state.adminState.actor.canEditGeneral);
  panel.innerHTML = `
    <section class="admin-section">
      <div class="section-header">
        <h2>General</h2>
        <p>Update the standalone index title, description, and public metadata files.</p>
      </div>
      <label>
        Index title
        <input id="general-title" value="${index.title || ""}" ${
    canEdit ? "" : "disabled"
  } />
      </label>
      <label>
        Description
        <textarea id="general-description" rows="4" ${
    canEdit ? "" : "disabled"
  }>${index.description || ""}</textarea>
      </label>
      <label>
        Live URL
        <input value="${index.canonicalUrl || ""}" readonly />
      </label>
      <label>
        Index image (JPEG)
        <input id="general-image" type="file" accept="image/jpeg" ${
    canEdit ? "" : "disabled"
  } />
      </label>
      <div class="hero-actions">
        <button class="primary-link button-link" id="general-save" ${
    canEdit ? "" : "disabled"
  }>Save</button>
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
        const payload = await callAdminFunction({
          functionName: "index-admin-write",
          body: {
            index_id: state.config.indexId,
            action: "update_general",
            title,
            description,
            image_content_b64: file
              ? await arrayBufferToBase64(file)
              : undefined,
          },
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        setNotice("General settings saved.");
        renderAll();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not save general settings.",
          "error",
        );
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
        <div><dt>Parent index URL</dt><dd>${
      connection.parentIndexUrl || "-"
    }</dd></div>
      </dl>
      <div class="hero-actions">
        ${
      connection.canonicalUrl
        ? `<a href="${connection.canonicalUrl}" target="_blank" rel="noreferrer">Visit site</a>`
        : ""
    }
        <button class="button-link" data-site-id="${connection.siteId}" ${
      canManage ? "" : "disabled"
    }>
          ${connection.status === "tracked" ? "Disconnect" : "Reconnect"}
        </button>
      </div>
    `;

    const actionButton = card.querySelector("button[data-site-id]");
    if (actionButton) {
      actionButton.addEventListener("click", async () => {
        try {
          const payload = await callAdminFunction({
            functionName: "index-admin-write",
            body: {
              index_id: state.config.indexId,
              action: "set_connection_status",
              site_id: connection.siteId,
              status: connection.status === "tracked" ? "delisted" : "tracked",
            },
          });
          state.adminState = payload.state;
          state.setup = payload.setup;
          setNotice("Connection state updated.");
          renderAll();
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not update connection.",
            "error",
          );
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
              <p>${
        owner.githubLogin ? `@${owner.githubLogin}` : owner.email
      }</p>
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
        <button class="primary-link button-link" id="collaborator-add" ${
    canManage ? "" : "disabled"
  }>
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
          const payload = await callAdminFunction({
            functionName: "index-admin-search-collaborators",
            body: {
              index_id: state.config.indexId,
              query,
            },
          });
          state.collaboratorSuggestions = Array.isArray(payload.results)
            ? payload.results
            : [];
          renderCollaboratorSuggestions(suggestions);
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not search collaborators.",
            "error",
          );
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
        const payload = await callAdminFunction({
          functionName: "index-admin-write",
          body: {
            index_id: state.config.indexId,
            action: "upsert_collaborator",
            collaborator_user_id: state.selectedCollaborator.userId,
            role: state.collaboratorRole,
          },
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        state.collaboratorSuggestions = [];
        state.selectedCollaborator = null;
        setNotice("Collaborator updated.");
        renderAll();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not update collaborator.",
          "error",
        );
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
      <p>${
      entry.githubLogin ? `@${entry.githubLogin}` : entry.email || entry.userId
    }</p>
      <div class="hero-actions">
        <select data-role-user="${entry.userId}" ${canManage ? "" : "disabled"}>
          <option value="contributor" ${
      entry.role === "contributor" ? "selected" : ""
    }>Contributor</option>
          <option value="editor" ${
      entry.role === "editor" ? "selected" : ""
    }>Editor</option>
          <option value="admin" ${
      entry.role === "admin" ? "selected" : ""
    }>Admin</option>
        </select>
        <button class="button-link" data-remove-user="${entry.userId}" ${
      canManage ? "" : "disabled"
    }>
          Remove
        </button>
      </div>
    `;

    const roleControl = card.querySelector(
      `[data-role-user="${entry.userId}"]`,
    );
    if (roleControl) {
      roleControl.addEventListener("change", async () => {
        try {
          const payload = await callAdminFunction({
            functionName: "index-admin-write",
            body: {
              index_id: state.config.indexId,
              action: "upsert_collaborator",
              collaborator_user_id: entry.userId,
              role: roleControl.value,
            },
          });
          state.adminState = payload.state;
          state.setup = payload.setup;
          setNotice("Collaborator role updated.");
          renderAll();
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not update collaborator role.",
            "error",
          );
        }
      });
    }

    const removeButton = card.querySelector(
      `[data-remove-user="${entry.userId}"]`,
    );
    if (removeButton) {
      removeButton.addEventListener("click", async () => {
        try {
          const payload = await callAdminFunction({
            functionName: "index-admin-write",
            body: {
              index_id: state.config.indexId,
              action: "remove_collaborator",
              collaborator_user_id: entry.userId,
            },
          });
          state.adminState = payload.state;
          state.setup = payload.setup;
          setNotice("Collaborator removed.");
          renderAll();
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not remove collaborator.",
            "error",
          );
        }
      });
    }

    list.append(card);
  });
};

const renderAdvanced = (panel) => {
  const index = state.adminState.index;
  const canManage = Boolean(state.adminState.actor.canManageAdvanced);
  panel.innerHTML = `
    <section class="admin-section">
      <div class="section-header">
        <h2>Advanced</h2>
        <p>Manage custom domain settings and OAuth setup references for the standalone index.</p>
      </div>
      <label>
        Custom domain
        <input id="advanced-domain" value="${index.canonicalUrl || ""}" ${
    canManage ? "" : "disabled"
  } />
      </label>
      <div class="hero-actions">
        <button class="primary-link button-link" id="advanced-save" ${
    canManage ? "" : "disabled"
  }>
          Connect domain
        </button>
        <button class="button-link" id="advanced-reset" ${
    canManage ? "" : "disabled"
  }>
          Reset to GitHub Pages
        </button>
      </div>
      <dl class="connected-site-meta">
        <div><dt>Site URL</dt><dd>${
    state.setup?.liveUrl || index.canonicalUrl || "-"
  }</dd></div>
        <div><dt>Auth callback URL</dt><dd>${
    state.setup?.authCallbackUrl || "-"
  }</dd></div>
        <div><dt>Provider settings</dt><dd>${
    state.setup?.authProvidersDashboardUrl || "-"
  }</dd></div>
      </dl>
    </section>
  `;

  const saveButton = byId("advanced-save");
  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      try {
        const domain = normalizeDomainInput(
          byId("advanced-domain")?.value || "",
        );
        if (!domain) {
          throw new Error(
            "Enter a domain first, or use reset to go back to GitHub Pages.",
          );
        }
        const payload = await callAdminFunction({
          functionName: "index-admin-write",
          body: {
            index_id: state.config.indexId,
            action: "update_advanced",
            domain,
          },
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        setNotice("Custom domain updated.");
        renderAll();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not update custom domain.",
          "error",
        );
      }
    });
  }

  const resetButton = byId("advanced-reset");
  if (resetButton) {
    resetButton.addEventListener("click", async () => {
      try {
        const payload = await callAdminFunction({
          functionName: "index-admin-write",
          body: {
            index_id: state.config.indexId,
            action: "update_advanced",
            domain: null,
          },
        });
        state.adminState = payload.state;
        state.setup = payload.setup;
        setNotice("Reset back to the GitHub Pages URL.");
        renderAll();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not reset the custom domain.",
          "error",
        );
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
  byId("admin-title").textContent = state.adminState.index.title ||
    "Standalone index admin";
  byId("admin-lead").textContent = state.adminMode === "local"
    ? "This admin is running against the child index's own Supabase project."
    : "This admin is temporarily using a Solidary bridge token until the child project can unlock /admin locally.";
  renderHeroLinks();
  renderFinalizationCard();
  renderTabs();
  renderPanel();
  setNotice(state.notice, state.noticeKind);
  byId("admin-guard").hidden = true;
  byId("admin-shell").hidden = false;
  scheduleFinalizationPoll();
};

const boot = async () => {
  try {
    state.config = await loadConfig("../config/index.json");
    const bridgeTokenFromUrl = extractBridgeTokenFromUrl();
    if (bridgeTokenFromUrl) {
      rememberBridgeToken({
        indexId: state.config.indexId,
        token: bridgeTokenFromUrl,
      });
    }
    const storedBridgeToken = readStoredBridgeToken(state.config.indexId);
    const storedLocalToken = readStoredLocalAdminToken(state.config.indexId);
    const bridgedToken = bridgeTokenFromUrl || storedBridgeToken;
    const localAvailability = await probeLocalAdminAvailability();
    state.localAdminAvailable = localAvailability.available;

    if (storedLocalToken) {
      state.bridgeToken = storedLocalToken;
      state.adminMode = "local";
      try {
        const payload = await readAdminState();
        applyPayload(payload);
        renderAll();
        setNotice("Local admin unlocked.");
        return;
      } catch {
        clearStoredLocalAdminToken(state.config.indexId);
        state.bridgeToken = "";
        state.adminMode = "bridge";
      }
    }

    if (bridgedToken) {
      state.bridgeToken = bridgedToken;
      state.adminMode = "bridge";
      try {
        const payload = await readAdminState();
        applyPayload(payload);
        renderAll();
        if (state.localAdminAvailable) {
          setNotice(
            "This child /admin is open locally and using a temporary bridge session. Unlock locally when ready.",
          );
        }
        return;
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not open the bridged child admin session.",
          "error",
        );
      }
    }

    renderGuard({
      message: state.localAdminAvailable
        ? localAvailability.message
        : "This child /admin is not ready for local unlock yet.",
      showLocalPasswordForm: state.localAdminAvailable,
    });
  } catch (error) {
    renderGuard({
      message: error instanceof Error
        ? error.message
        : "Could not load standalone admin.",
      showLocalPasswordForm: state.localAdminAvailable,
    });
    setNotice(
      error instanceof Error
        ? error.message
        : "Could not load standalone admin.",
      "error",
    );
  }
};

void boot();
