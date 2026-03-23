type IndexCreateInlineCopyValueProps = {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: (value: string, successMessage: string) => void;
};

export default function IndexCreateInlineCopyValue({
  label,
  value,
  copyLabel,
  onCopy
}: IndexCreateInlineCopyValueProps) {
  const trimmedValue = value.trim();

  return (
    <div className="index-create-inline-copy-item">
      <strong>{label}</strong>
      <code>{trimmedValue || "-"}</code>
      <button
        type="button"
        className="ghost"
        onClick={() => onCopy(trimmedValue, `${label} copied.`)}
        disabled={!trimmedValue}
      >
        {copyLabel}
      </button>
    </div>
  );
}
