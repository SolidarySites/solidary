import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "./types";

export type CollaboratorSearchRpcRow = {
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  github_login: string | null;
};

export type ManagedCollaboratorApiRow = {
  userId: string | null;
  role: CollaboratorRole | "viewer" | null;
  email: string | null;
  displayName: string | null;
  githubLogin: string | null;
  syncState: "synced" | "pending_invite" | "unknown" | null;
};

export const normalizeCollaboratorIdentifier = (value: string): string =>
  value.startsWith("@") ? value.slice(1).trim() : value.trim();

export const mapCollaboratorSearchRows = (
  rows: CollaboratorSearchRpcRow[] | null | undefined
): CollaboratorSearchResult[] =>
  (rows ?? [])
    .map((row) => {
      const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
      const email = typeof row.email === "string" ? row.email.trim() : "";
      const displayName =
        typeof row.display_name === "string" && row.display_name.trim()
          ? row.display_name.trim()
          : email;
      const githubLogin =
        typeof row.github_login === "string" && row.github_login.trim()
          ? row.github_login.trim()
          : null;
      if (!userId || !email) return null;
      return {
        userId,
        email,
        displayName,
        githubLogin
      } satisfies CollaboratorSearchResult;
    })
    .filter((entry): entry is CollaboratorSearchResult => Boolean(entry));

export const mapManagedCollaboratorRows = (
  rows: ManagedCollaboratorApiRow[] | null | undefined
): ManagedCollaborator[] =>
  (rows ?? [])
    .map((row) => {
      const userId = typeof row.userId === "string" ? row.userId.trim() : "";
      const email = typeof row.email === "string" ? row.email.trim() : "";
      const displayName =
        typeof row.displayName === "string" && row.displayName.trim()
          ? row.displayName.trim()
          : email || userId;
      const githubLogin =
        typeof row.githubLogin === "string" && row.githubLogin.trim()
          ? row.githubLogin.trim()
          : null;
      const role =
        row.role === "viewer"
          ? "contributor"
          : row.role === "admin" || row.role === "editor" || row.role === "contributor"
            ? row.role
            : null;
      const syncState =
        row.syncState === "synced" ||
        row.syncState === "pending_invite" ||
        row.syncState === "unknown"
          ? row.syncState
          : "unknown";
      if (!userId || !role) return null;
      return {
        userId,
        role,
        email,
        displayName,
        githubLogin,
        syncState
      } satisfies ManagedCollaborator;
    })
    .filter((entry): entry is ManagedCollaborator => Boolean(entry));
