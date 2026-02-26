export type StudioSettingsSection = "general" | "connections" | "collaborators" | "danger";

export const STUDIO_SETTINGS_SECTION_ORDER: StudioSettingsSection[] = [
  "general",
  "connections",
  "collaborators",
  "danger"
];

export const STUDIO_SETTINGS_SECTION_LABELS: Record<StudioSettingsSection, string> = {
  general: "General",
  connections: "Connections",
  collaborators: "Collaborators",
  danger: "Advanced"
};

export const isStudioSettingsSection = (value: string): value is StudioSettingsSection =>
  value === "general" ||
  value === "connections" ||
  value === "collaborators" ||
  value === "danger";

export const parseStudioSettingsSection = (
  value: string | null | undefined
): StudioSettingsSection | null => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isStudioSettingsSection(normalized) ? normalized : null;
};

export const getStudioSettingsLockKey = (section: StudioSettingsSection) => `settings:${section}`;
