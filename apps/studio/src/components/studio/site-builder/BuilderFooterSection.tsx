import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon
} from "./BuilderToolbarIcons";
import type { FooterModule, FooterModuleAlignment } from "./types";
import type { ReactNode } from "react";

type BuilderFooterSectionProps = {
  disabled: boolean;
  fixed: boolean;
  modules: FooterModule[];
  onDisabledChange: (value: boolean) => void;
  onFixedChange: (value: boolean) => void;
  onModuleContentChange: (index: number, value: string) => void;
  onModuleAlignmentChange: (index: number, value: FooterModuleAlignment) => void;
  onMoveModuleUp: (index: number) => void;
  onMoveModuleDown: (index: number) => void;
};

const alignmentActions: Array<{
  value: FooterModuleAlignment;
  label: string;
  Icon: () => ReactNode;
}> = [
  { value: "left", label: "Align left", Icon: AlignLeftIcon },
  { value: "center", label: "Align center", Icon: AlignCenterIcon },
  { value: "right", label: "Align right", Icon: AlignRightIcon }
];

const BuilderFooterSection = ({
  disabled,
  fixed,
  modules,
  onDisabledChange,
  onFixedChange,
  onModuleContentChange,
  onModuleAlignmentChange,
  onMoveModuleUp,
  onMoveModuleDown
}: BuilderFooterSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Footer</h2>
      <p>
        Configure visibility and reorder footer modules. Use <code>%copyright%</code> to insert
        the dynamic copyright string.
      </p>
    </div>

    <label className="checkbox">
      <input
        type="checkbox"
        checked={disabled}
        onChange={(event) => onDisabledChange(event.target.checked)}
      />
      Hide footer
    </label>

    <label className="checkbox">
      <input type="checkbox" checked={fixed} onChange={(event) => onFixedChange(event.target.checked)} />
      Make footer fixed
    </label>

    <div className="builder-page-list">
      {modules.map((module, index) => (
        <div key={`footer-module-${index}`} className="builder-page-card">
          <div className="section-header">
            <h3>{`Module ${index + 1}`}</h3>
            <p>
              {index === 0
                ? "Left aligned column."
                : index === 1
                  ? "Center aligned column."
                  : "Right aligned column."}
            </p>
          </div>
          <textarea
            value={module.content}
            onChange={(event) => onModuleContentChange(index, event.target.value)}
            rows={4}
          />
          <div className="builder-footer-module-align">
            {alignmentActions.map((action) => (
              <button
                key={`${index}-${action.value}`}
                type="button"
                className={`builder-toolbar-button ${
                  module.alignment === action.value ? "is-active" : ""
                }`}
                aria-label={action.label}
                title={action.label}
                onClick={() => onModuleAlignmentChange(index, action.value)}
              >
                <action.Icon />
              </button>
            ))}
          </div>
          <div className="builder-actions-buttons">
            <button type="button" className="ghost" onClick={() => onMoveModuleUp(index)} disabled={index === 0}>
              Move up
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => onMoveModuleDown(index)}
              disabled={index === modules.length - 1}
            >
              Move down
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default BuilderFooterSection;
