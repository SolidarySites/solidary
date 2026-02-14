import BuilderActions from "./BuilderActions";
import type { PublishFeedback } from "./types";

type BuilderTopbarProps = {
  savingDraft: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  canSaveDraft: boolean;
  canPublish: boolean;
  liveSiteUrl: string | null;
  githubRepoUrl: string | null;
  publishFeedback: PublishFeedback | null;
  onSaveDraft: () => void;
  onPublish: () => void;
};

const BuilderTopbar = ({
  savingDraft,
  isProvisioning,
  provisionStep,
  canSaveDraft,
  canPublish,
  liveSiteUrl,
  githubRepoUrl,
  publishFeedback,
  onSaveDraft,
  onPublish
}: BuilderTopbarProps) => (
  <div className="builder-topbar">
    <div className="builder-topbar-main">
      <div className="builder-topbar-links">
        {liveSiteUrl && (
          <a href={liveSiteUrl} target="_blank" rel="noopener noreferrer">
            Live site
          </a>
        )}
        {githubRepoUrl && (
          <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer">
            GitHub repo
          </a>
        )}
      </div>
    </div>
    <BuilderActions
      savingDraft={savingDraft}
      isProvisioning={isProvisioning}
      provisionStep={provisionStep}
      canSaveDraft={canSaveDraft}
      canPublish={canPublish}
      publishFeedback={publishFeedback}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />
  </div>
);

export default BuilderTopbar;
