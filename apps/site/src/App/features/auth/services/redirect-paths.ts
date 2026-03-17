const APP_ROUTE_ROOT_SEGMENTS = new Set([
  "support",
  "contact",
  "explorer",
  "search",
  "studio",
  "site-create",
  "index-create",
  "admin",
  "profile"
]);

export const resolveGitHubPagesBasename = ({
  hostname,
  pathname
}: {
  hostname: string;
  pathname: string;
}) => {
  if (!/github\.io$/i.test(hostname.trim())) {
    return "";
  }

  const [firstSegment] = pathname.split("/").filter(Boolean);
  if (!firstSegment || APP_ROUTE_ROOT_SEGMENTS.has(firstSegment)) {
    return "";
  }

  return `/${firstSegment}`;
};

export const resolveAuthReturnPath = ({
  hostname,
  currentPathname,
  requestedReturnToPath
}: {
  hostname: string;
  currentPathname: string;
  requestedReturnToPath?: string;
}) => {
  const fallbackPath = currentPathname === "/*" ? "/" : currentPathname || "/";
  const normalizedRequestedPath =
    typeof requestedReturnToPath === "string" && requestedReturnToPath.trim().startsWith("/")
      ? requestedReturnToPath.trim()
      : fallbackPath;
  const basename = resolveGitHubPagesBasename({
    hostname,
    pathname: currentPathname
  });

  if (
    !basename ||
    normalizedRequestedPath === basename ||
    normalizedRequestedPath.startsWith(`${basename}/`)
  ) {
    return normalizedRequestedPath;
  }

  if (normalizedRequestedPath === "/") {
    return `${basename}/`;
  }

  return `${basename}${normalizedRequestedPath}`;
};
