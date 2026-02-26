export const resolveSettingsLockHolderName = (holderName: string | null | undefined) => {
  const normalized = typeof holderName === "string" ? holderName.trim() : "";
  return normalized || "Another user";
};
