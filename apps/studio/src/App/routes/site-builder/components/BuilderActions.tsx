import type { PublishFeedback } from "../services/types";

type BuilderActionsProps = {
  savingDraft: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  canSaveDraft: boolean;
  canPublish: boolean;
  publishLabel: string;
  publishFeedback: PublishFeedback | null;
  onSaveDraft: () => void;
  onPublish: () => void;
};

const BuilderActions = ({
  savingDraft,
  isProvisioning,
  provisionStep,
  canSaveDraft,
  canPublish,
  publishLabel,
  publishFeedback,
  onSaveDraft,
  onPublish
}: BuilderActionsProps) => (
  <div className="builder-actions">
    <div className="builder-actions-buttons">
      <button className="ghost" onClick={onSaveDraft} disabled={!canSaveDraft}>
        {savingDraft ? "Saving..." : "Save draft"}
      </button>
      <button className="primary" onClick={onPublish} disabled={!canPublish}>
        {isProvisioning
          ? `${publishLabel}...`
          : publishFeedback?.kind === "progress"
            ? "Building..."
            : publishLabel}
      </button>
    </div>
    {(isProvisioning || publishFeedback) && (
      <div className="builder-actions-feedback">
        <div
          className={`builder-publish-feedback ${
            isProvisioning
              ? ""
              : publishFeedback?.kind === "error"
                ? "is-error"
                : publishFeedback?.kind === "success"
                  ? "is-success"
                  : ""
          }`}
        >
          <span>{isProvisioning ? "Publishing your site..." : publishFeedback?.text}</span>
          {isProvisioning && <span>{provisionStep}</span>}
          {!isProvisioning && publishFeedback?.runUrl && (
            <a href={publishFeedback.runUrl} target="_blank" rel="noopener noreferrer">
              {publishLabel === "Create PR"
                ? "View pull request"
                : publishFeedback.kind === "progress"
                  ? "View actions"
                  : "View build"}
            </a>
          )}
          {!isProvisioning && publishFeedback?.pagesUrl && publishFeedback.kind === "success" && (
            <a href={publishFeedback.pagesUrl} target="_blank" rel="noopener noreferrer">
              Open site
            </a>
          )}
        </div>
      </div>
    )}
  </div>
);

export default BuilderActions;
