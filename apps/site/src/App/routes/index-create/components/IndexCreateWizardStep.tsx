import type { ReactNode } from "react";
import type { IndexCreateWizardStepStatus } from "../services/wizard-progress";

type IndexCreateWizardStepProps = {
  index: number;
  title: string;
  status: IndexCreateWizardStepStatus;
  summary?: ReactNode;
  children?: ReactNode;
};

const STATUS_LABELS: Record<IndexCreateWizardStepStatus, string> = {
  complete: "Done",
  current: "Current",
  locked: "Locked"
};

export default function IndexCreateWizardStep({
  index,
  title,
  status,
  summary,
  children
}: IndexCreateWizardStepProps) {
  const isCurrent = status === "current";

  return (
    <section className={`index-create-step is-${status}`.trim()}>
      <header className="index-create-step-header">
        <div className="index-create-step-heading">
          <span className="index-create-step-number">{index}</span>
          <div>
            <h2>{title}</h2>
            {summary ? <div className="index-create-step-summary">{summary}</div> : null}
          </div>
        </div>
        <span className={`index-create-step-status is-${status}`.trim()}>
          {STATUS_LABELS[status]}
        </span>
      </header>

      {isCurrent ? <div className="index-create-step-body">{children}</div> : null}
    </section>
  );
}
