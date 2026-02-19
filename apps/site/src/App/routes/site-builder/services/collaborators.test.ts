import { describe, expect, it } from "vitest";
import {
  mapCollaboratorSearchRows,
  mapManagedCollaboratorRows,
  normalizeCollaboratorIdentifier,
  type CollaboratorSearchRpcRow,
  type ManagedCollaboratorApiRow
} from "./collaborators";

describe("normalizeCollaboratorIdentifier", () => {
  it("trims a GitHub handle that starts with @", () => {
    expect(normalizeCollaboratorIdentifier("@octocat")).toBe("octocat");
  });

  it("keeps email identifiers unchanged except whitespace trim", () => {
    expect(normalizeCollaboratorIdentifier("  person@example.com  ")).toBe("person@example.com");
  });
});

describe("mapCollaboratorSearchRows", () => {
  it("maps valid rows and filters invalid entries", () => {
    const rows: CollaboratorSearchRpcRow[] = [
      {
        user_id: "user-1",
        email: "user-1@example.com",
        display_name: "User One",
        github_login: "userone"
      },
      {
        user_id: "user-2",
        email: "user-2@example.com",
        display_name: "",
        github_login: "   "
      },
      {
        user_id: null,
        email: "missing-id@example.com",
        display_name: "Missing Id",
        github_login: null
      }
    ];

    expect(mapCollaboratorSearchRows(rows)).toEqual([
      {
        userId: "user-1",
        email: "user-1@example.com",
        displayName: "User One",
        githubLogin: "userone"
      },
      {
        userId: "user-2",
        email: "user-2@example.com",
        displayName: "user-2@example.com",
        githubLogin: null
      }
    ]);
  });
});

describe("mapManagedCollaboratorRows", () => {
  it("normalizes managed collaborator rows for display", () => {
    const rows: ManagedCollaboratorApiRow[] = [
      {
        userId: "user-1",
        role: "admin",
        email: "admin@example.com",
        displayName: "Admin User",
        githubLogin: "adminuser",
        syncState: "synced"
      },
      {
        userId: "user-2",
        role: "editor",
        email: "editor@example.com",
        displayName: "",
        githubLogin: "",
        syncState: null
      },
      {
        userId: "missing-role",
        role: null,
        email: "missing-role@example.com",
        displayName: "Invalid",
        githubLogin: "invalid",
        syncState: "unknown"
      }
    ];

    expect(mapManagedCollaboratorRows(rows)).toEqual([
      {
        userId: "user-1",
        role: "admin",
        email: "admin@example.com",
        displayName: "Admin User",
        githubLogin: "adminuser",
        syncState: "synced"
      },
      {
        userId: "user-2",
        role: "editor",
        email: "editor@example.com",
        displayName: "editor@example.com",
        githubLogin: null,
        syncState: "unknown"
      }
    ]);
  });
});
