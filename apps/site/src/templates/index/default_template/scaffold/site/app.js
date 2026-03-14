const textById = (id) => document.getElementById(id);

const renderLink = (container, { href, label, primary = false }) => {
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

const setHref = (id, href, label) => {
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

const setText = (id, value) => {
  const element = textById(id);
  if (element) {
    element.textContent = value || "-";
  }
};

const loadConfig = async () => {
  const response = await fetch("./config/index.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load index configuration.");
  }
  return response.json();
};

const boot = async () => {
  try {
    const config = await loadConfig();
    const title = typeof config.title === "string" ? config.title : "Solidary Index";
    const description =
      typeof config.description === "string"
        ? config.description
        : "Your index infrastructure is ready.";

    document.title = `${title} | Solidary Index`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute("content", description);
    }

    setText("index-title", title);
    setText("index-description", description);
    setText("archive-slug", typeof config.slug === "string" ? config.slug : "");
    setText("archive-id", typeof config.archiveId === "string" ? config.archiveId : "");
    setText("project-ref", typeof config.projectRef === "string" ? config.projectRef : "");
    setText("project-url", typeof config.projectUrl === "string" ? config.projectUrl : "");

    const heroActions = document.getElementById("hero-actions");
    if (heroActions) {
      heroActions.innerHTML = "";
      if (typeof config.projectDashboardUrl === "string" && config.projectDashboardUrl) {
        renderLink(heroActions, {
          href: config.projectDashboardUrl,
          label: "Open Supabase project",
          primary: true
        });
      }
      if (typeof config.repoUrl === "string" && config.repoUrl) {
        renderLink(heroActions, {
          href: config.repoUrl,
          label: "Open GitHub repo"
        });
      }
      if (typeof config.siteUrl === "string" && config.siteUrl && config.siteUrl !== window.location.href) {
        renderLink(heroActions, {
          href: config.siteUrl,
          label: "Open live URL"
        });
      }
    }

    setHref("repo-link", typeof config.repoUrl === "string" ? config.repoUrl : "", "Open repository");
    setHref(
      "supabase-link",
      typeof config.projectDashboardUrl === "string" ? config.projectDashboardUrl : "",
      "Open project"
    );
  } catch (error) {
    setText(
      "runtime-status",
      error instanceof Error ? error.message : "Could not load provisioned index metadata."
    );
  }
};

void boot();
