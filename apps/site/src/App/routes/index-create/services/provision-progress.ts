const PROVISION_STAGES = [
  "Optimizing index image...",
  "Preparing index provisioning...",
  "Resolving Solidary root index...",
  "Resolving Supabase management access...",
  "Loading index template...",
  "Reserving index slug...",
  "Creating GitHub repository...",
  "Creating main branch...",
  "Creating Supabase project...",
  "Retrieving project API keys...",
  "Bootstrapping database schema...",
  "Creating repository files...",
  "Enabling GitHub Pages...",
  "Saving index metadata...",
  "Index provisioning completed."
] as const;

const REPOSITORY_FILES_PROGRESS = /^Creating repository files \((\d+)%\)\.\.\.$/i;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export const INDEX_PROVISION_PROGRESS_SEGMENT_COUNT = PROVISION_STAGES.length - 1;

export const getIndexProvisionProgress = (step: string | null | undefined) => {
  const normalizedStep = step?.trim() ?? "";
  if (!normalizedStep) {
    return {
      percent: 0,
      segmentCount: INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
    };
  }

  const repositoryFilesMatch = normalizedStep.match(REPOSITORY_FILES_PROGRESS);
  if (repositoryFilesMatch) {
    const repositoryFilesIndex = PROVISION_STAGES.indexOf("Creating repository files...");
    const repositoryFilesPercent = Number(repositoryFilesMatch[1] ?? 0);
    const baseProgress = repositoryFilesIndex / INDEX_PROVISION_PROGRESS_SEGMENT_COUNT;
    const stageShare = clampPercent(repositoryFilesPercent) / 100 / INDEX_PROVISION_PROGRESS_SEGMENT_COUNT;

    return {
      percent: clampPercent((baseProgress + stageShare) * 100),
      segmentCount: INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
    };
  }

  const matchedStageIndex = PROVISION_STAGES.findIndex((stage) => stage === normalizedStep);
  if (matchedStageIndex >= 0) {
    return {
      percent: clampPercent((matchedStageIndex / INDEX_PROVISION_PROGRESS_SEGMENT_COUNT) * 100),
      segmentCount: INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
    };
  }

  const normalizedLower = normalizedStep.toLowerCase();
  const partialStageIndex = PROVISION_STAGES.findIndex((stage) =>
    normalizedLower.startsWith(stage.toLowerCase().replace(/\.\.\.$/, ""))
  );
  if (partialStageIndex >= 0) {
    return {
      percent: clampPercent((partialStageIndex / INDEX_PROVISION_PROGRESS_SEGMENT_COUNT) * 100),
      segmentCount: INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
    };
  }

  return {
    percent: 0,
    segmentCount: INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
  };
};
