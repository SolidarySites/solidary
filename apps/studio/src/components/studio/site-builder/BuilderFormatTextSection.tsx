import BuilderEditorToolbar from "./BuilderEditorToolbar";

type BuilderFormatTextSectionProps = {
  canFormatText: boolean;
  onRunCommand: (command: string, value?: string) => void;
  onRunLink: () => void;
};

const BuilderFormatTextSection = ({
  canFormatText,
  onRunCommand,
  onRunLink
}: BuilderFormatTextSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Format Text</h2>
      <p>Use these controls to format the currently selected content in the preview editor.</p>
    </div>
    {canFormatText ? (
      <BuilderEditorToolbar onRunCommand={onRunCommand} onRunLink={onRunLink} />
    ) : (
      <p>Formatting tools are available once the preview has loaded.</p>
    )}
  </div>
);

export default BuilderFormatTextSection;
