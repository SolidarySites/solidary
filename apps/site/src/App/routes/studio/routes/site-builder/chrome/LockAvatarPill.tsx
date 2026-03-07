type LockAvatarPillProps = {
  holderName: string;
  holderAvatarUrl?: string | null;
};

const getInitials = (value: string) => {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
};

const LockAvatarPill = ({ holderName, holderAvatarUrl }: LockAvatarPillProps) => {
  const normalizedName = holderName.trim() || "Unknown";
  const avatarUrl = typeof holderAvatarUrl === "string" && holderAvatarUrl.trim()
    ? holderAvatarUrl.trim()
    : null;
  const title = `${normalizedName} is editing`;

  return (
    <span className="builder-lock-avatar-pill" title={title} aria-label={title}>
      {avatarUrl ? (
        <img
          className="builder-lock-avatar-pill-image"
          src={avatarUrl}
          alt={normalizedName}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="builder-lock-avatar-pill-fallback" aria-hidden="true">
          {getInitials(normalizedName)}
        </span>
      )}
    </span>
  );
};

export default LockAvatarPill;
