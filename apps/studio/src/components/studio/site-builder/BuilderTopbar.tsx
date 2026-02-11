import BuilderActions from "./BuilderActions";
import BuilderEditorToolbar from "./BuilderEditorToolbar";
import type { PublishFeedback } from "./types";

type BuilderTopbarProps = {
  showToolbar: boolean;
  savingDraft: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  canSaveDraft: boolean;
  canPublish: boolean;
  publishFeedback: PublishFeedback | null;
  onSaveDraft: () => void;
  onPublish: () => void;
  onRunCommand: (command: string, value?: string) => void;
  onRunLink: () => void;
};

const BuilderTopbar = ({
  showToolbar,
  savingDraft,
  isProvisioning,
  provisionStep,
  canSaveDraft,
  canPublish,
  publishFeedback,
  onSaveDraft,
  onPublish,
  onRunCommand,
  onRunLink
}: BuilderTopbarProps) => (
  <div className="builder-topbar">
    <div className="builder-topbar-main">
      <h1>Site Builder</h1>
      {showToolbar && <BuilderEditorToolbar onRunCommand={onRunCommand} onRunLink={onRunLink} />}
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
