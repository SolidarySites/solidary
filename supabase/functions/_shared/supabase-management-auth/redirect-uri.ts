const SUPABASE_MANAGEMENT_CALLBACK_PATH =
  "/functions/v1/supabase-management-callback";

const normalizeTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const requireHttpsUrl = (value: string, label: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }

  return parsed;
};

export const resolveSupabaseManagementRedirectUri = ({
  explicitRedirectUri,
  supabaseUrl,
}: {
  explicitRedirectUri?: string | null;
  supabaseUrl?: string | null;
} = {}) => {
  const configuredRedirectUri = normalizeTrimmedString(explicitRedirectUri);
  if (configuredRedirectUri) {
    return requireHttpsUrl(
      configuredRedirectUri,
      "SUPA_MANAGEMENT_OAUTH_REDIRECT_URI",
    ).toString();
  }

  const configuredSupabaseUrl = normalizeTrimmedString(supabaseUrl);
  if (!configuredSupabaseUrl) {
    throw new Error(
      "SUPABASE_URL is required to build the Supabase management redirect URI.",
    );
  }

  const publicSupabaseUrl = requireHttpsUrl(
    configuredSupabaseUrl,
    "SUPABASE_URL",
  );
  return new URL(SUPABASE_MANAGEMENT_CALLBACK_PATH, publicSupabaseUrl)
    .toString();
};
