import type { CSSProperties } from "react";

type IndexCreateProgressBarProps = {
  label: string;
  value: number;
  valueLabel?: string;
  segmentCount?: number;
  detail?: string | null;
};

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

export default function IndexCreateProgressBar({
  label,
  value,
  valueLabel,
  segmentCount = 1,
  detail
}: IndexCreateProgressBarProps) {
  const normalizedValue = clampPercent(value);
  const normalizedSegmentCount = Math.max(1, Math.trunc(segmentCount) || 1);
  const trackStyle = {
    "--segment-count": String(normalizedSegmentCount)
  } as CSSProperties;

  return (
    <div className="index-create-progress-card">
      <div className="index-create-progress-header">
        <strong>{label}</strong>
        <span>{valueLabel || `${Math.round(normalizedValue)}%`}</span>
      </div>
      <div className="index-create-progress-track" style={trackStyle}>
        <div className="index-create-progress-fill" style={{ width: `${normalizedValue}%` }} />
      </div>
      {detail ? <p className="index-create-progress-detail">{detail}</p> : null}
    </div>
  );
}
