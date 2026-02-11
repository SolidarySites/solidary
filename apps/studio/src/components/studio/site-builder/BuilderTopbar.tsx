import BuilderActions from "./BuilderActions";
import type { PublishFeedback } from "./types";

type BuilderTopbarProps = {
  savingDraft: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  canSaveDraft: boolean;
  canPublish: boolean;
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
  publishFeedback,
  onSaveDraft,
  onPublish
}: BuilderTopbarProps) => (
  <div className="builder-topbar">
    <div className="builder-topbar-main">
      <h1>Site Builder</h1>
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
