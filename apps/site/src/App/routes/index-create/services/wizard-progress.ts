import type { IndexAdminSetup } from "../../admin/services/types";
import type { IndexCreatePrerequisites } from "./types";

export type IndexCreateWizardStepKey =
  | "github_app"
  | "supabase"
  | "organization"
  | "details"
  | "provision"
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
  "github_oauth",
  "finalization",
  "functions",
  "launch"
];

export const buildIndexCreateWizardSteps = ({
  prerequisites,
  organizationConfirmed,
  detailsConfirmed,
  archiveId,
  setup,
  isProvisioning
}: {
  prerequisites: IndexCreatePrerequisites;
  organizationConfirmed: boolean;
  detailsConfirmed: boolean;
  archiveId: string;
  setup: IndexAdminSetup | null;
  isProvisioning: boolean;
}): IndexCreateWizardStep[] => {
  const completed = new Set<IndexCreateWizardStepKey>();
  const hasArchive = Boolean(archiveId.trim());

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
  if (hasArchive && setup?.authSetup.localAuthReady) {
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
