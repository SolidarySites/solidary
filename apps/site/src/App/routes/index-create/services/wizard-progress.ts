import type { IndexAdminSetup } from "../../admin/services/types";
import type { IndexCreatePrerequisites } from "./types";

export type IndexCreateWizardStepKey =
  | "github_app"
  | "supabase"
  | "organization"
  | "details"
  | "provision"
  | "supabase_pat"
  | "github_oauth"
  | "finalization"
  | "functions"
  | "launch";

export type IndexCreateWizardStepStatus = "complete" | "current" | "locked";

export type IndexCreateWizardStep = {
  key: IndexCreateWizardStepKey;
  title: string;
  status: IndexCreateWizardStepStatus;
};

const STEP_TITLES: Record<IndexCreateWizardStepKey, string> = {
  github_app: "Connect GitHub App",
  supabase: "Connect Supabase",
  organization: "Choose Supabase organization",
  details: "Name your index",
  provision: "Create your index",
  supabase_pat: "Create Supabase personal access token",
  github_oauth: "Create GitHub sign-in app",
  finalization: "Finish child setup",
  functions: "Deploy child functions",
  launch: "Open your standalone index"
};

const stepOrder: IndexCreateWizardStepKey[] = [
  "github_app",
  "supabase",
  "organization",
  "details",
  "provision",
  "supabase_pat",
  "github_oauth",
  "finalization",
  "functions",
  "launch"
];

export const buildIndexCreateWizardSteps = ({
  prerequisites,
  organizationConfirmed,
  detailsConfirmed,
  supabasePatConfirmed,
  indexId,
  setup,
  isProvisioning
}: {
  prerequisites: IndexCreatePrerequisites;
  organizationConfirmed: boolean;
  detailsConfirmed: boolean;
  supabasePatConfirmed: boolean;
  indexId: string;
  setup: IndexAdminSetup | null;
  isProvisioning: boolean;
}): IndexCreateWizardStep[] => {
  const completed = new Set<IndexCreateWizardStepKey>();
  const hasArchive = Boolean(indexId.trim());
  const functionSecretsReady =
    (setup?.functionsDeployment.requiredSecrets.length ?? 0) > 0 &&
    setup?.functionsDeployment.requiredSecrets.every((secret) => secret.isConfigured);

  if (hasArchive || prerequisites.githubReady) {
    completed.add("github_app");
  }
  if (
    completed.has("github_app") &&
    (hasArchive || (prerequisites.supabaseReady && prerequisites.supabaseScopesReady))
  ) {
    completed.add("supabase");
  }
  if (completed.has("supabase") && (hasArchive || organizationConfirmed)) {
    completed.add("organization");
  }
  if (completed.has("organization") && (hasArchive || detailsConfirmed)) {
    completed.add("details");
  }
  if (hasArchive) {
    completed.add("provision");
  }
  if (
    hasArchive &&
    (supabasePatConfirmed ||
      functionSecretsReady ||
      setup?.authSetup.localAuthReady ||
      setup?.finalization.isFinalized ||
      setup?.functionsDeployment.status === "deployed")
  ) {
    completed.add("supabase_pat");
  }
  if (
    hasArchive &&
    completed.has("supabase_pat") &&
    (setup?.authSetup.localAuthReady ||
      setup?.finalization.isRunning ||
      setup?.finalization.isFinalized ||
      setup?.functionsDeployment.status === "deployed")
  ) {
    completed.add("github_oauth");
  }
  if (hasArchive && setup?.finalization.isFinalized) {
    completed.add("finalization");
  }
  if (hasArchive && setup?.functionsDeployment.status === "deployed") {
    completed.add("functions");
  }

  let activeKey: IndexCreateWizardStepKey = "github_app";
  if (isProvisioning && !hasArchive) {
    activeKey = "provision";
  } else {
    const firstIncomplete = stepOrder.find((key) => !completed.has(key));
    activeKey = firstIncomplete ?? "launch";
  }

  return stepOrder.map((key) => {
    return {
      key,
      title: STEP_TITLES[key],
      status: completed.has(key) ? "complete" : key === activeKey ? "current" : "locked"
    };
  });
};
