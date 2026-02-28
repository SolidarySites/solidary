type BuilderActionsProps = {
  savingDraft: boolean;
  canSaveDraft: boolean;
  onSaveDraft: () => void;
};

const BuilderActions = ({
  savingDraft,
  canSaveDraft,
  onSaveDraft
}: BuilderActionsProps) => (
  <div className="builder-actions">
    <div className="builder-actions-buttons">
      <button className="ghost" onClick={onSaveDraft} disabled={!canSaveDraft}>
        {savingDraft ? "Saving..." : "Save"}
      </button>
    </div>
  </div>
);

export default BuilderActions;
