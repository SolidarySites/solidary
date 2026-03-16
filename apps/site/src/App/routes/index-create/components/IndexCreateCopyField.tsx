type IndexCreateCopyFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: (value: string, successMessage: string) => void;
};

export default function IndexCreateCopyField({
  label,
  value,
  copyLabel,
  onCopy
}: IndexCreateCopyFieldProps) {
  const trimmedValue = value.trim();

  return (
    <label className="index-create-copy-field">
      <span>{label}</span>
      <div className="index-create-copy-field-row">
        <textarea readOnly rows={trimmedValue.length > 72 ? 3 : 2} value={trimmedValue} />
        <button
          type="button"
          className="ghost"
          onClick={() => onCopy(trimmedValue, `${label} copied.`)}
          disabled={!trimmedValue}
        >
          {copyLabel}
        </button>
      </div>
    </label>
  );
}
