import { useRef, type ChangeEvent, type FormEvent } from "react";

type AvatarPill = {
  key: string;
  path: string;
  imageUrl: string | null;
};

type ProfileSettingsFormSectionProps = {
  displayName: string;
  displayNameTooLong: boolean;
  solidaryAvatarUrl: string | null;
  solidaryAvatarFallback: string;
  avatarPills: AvatarPill[];
  canAddAvatar: boolean;
  canRemoveAvatar: boolean;
  hasChanges: boolean;
  saveBusy: boolean;
  avatarAddBusy: boolean;
  avatarRemoveBusy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onDisplayNameChange: (value: string) => void;
  onAvatarFileChange: (file: File | null) => void;
  onSelectAvatar: (path: string) => void;
  onRemoveAvatar: () => void;
};

export default function ProfileSettingsFormSection({
  displayName,
  displayNameTooLong,
  solidaryAvatarUrl,
  solidaryAvatarFallback,
  avatarPills,
  canAddAvatar,
  canRemoveAvatar,
  hasChanges,
  saveBusy,
  avatarAddBusy,
  avatarRemoveBusy,
  onSubmit,
  onReset,
  onDisplayNameChange,
  onAvatarFileChange,
  onSelectAvatar,
  onRemoveAvatar
}: ProfileSettingsFormSectionProps) {
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const controlsBusy = saveBusy || avatarAddBusy || avatarRemoveBusy;

  const onAvatarFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAvatarFileChange(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const onAddAvatar = () => {
    if (!canAddAvatar || controlsBusy) {
      return;
    }

    avatarFileInputRef.current?.click();
  };

  return (
    <form className="form-grid profile-settings-form" onSubmit={onSubmit}>
      <label htmlFor="profile-display-name">
        Display name
        <input
          id="profile-display-name"
          type="text"
          autoComplete="name"
          className={displayNameTooLong ? "profile-input-error" : undefined}
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          placeholder="How your name should appear"
        />
        {displayNameTooLong && (
          <span className="profile-field-error">max 20 characters</span>
        )}
      </label>

      <div className="profile-solidary-avatar-row">
        <p className="profile-solidary-avatar-label">Avatar</p>
        <div className="profile-solidary-avatar-current">
          <div className="profile-avatar-shell profile-solidary-avatar-shell">
            {solidaryAvatarUrl ? (
              <div
                className="profile-avatar-image"
                style={{ backgroundImage: `url(${solidaryAvatarUrl})` }}
                role="img"
                aria-label="Solidary avatar preview"
              />
            ) : (
              <div className="profile-avatar-fallback" aria-hidden="true">
                {solidaryAvatarFallback}
              </div>
            )}
          </div>
          <div className="profile-solidary-avatar-actions">
            <button
              type="button"
              className="profile-avatar-link"
              onClick={onAddAvatar}
              disabled={!canAddAvatar || controlsBusy}
            >
              add
            </button>
            <button
              type="button"
              className="profile-avatar-link"
              onClick={onRemoveAvatar}
              disabled={!canRemoveAvatar || controlsBusy}
            >
              remove
            </button>
            <input
              ref={avatarFileInputRef}
              id="profile-avatar-upload"
              className="profile-avatar-file-input"
              type="file"
              accept="image/*"
              onChange={onAvatarFileInputChange}
            />
          </div>
        </div>

        <div className="profile-solidary-avatar-pills" aria-label="Avatar options">
          {avatarPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className="profile-avatar-pill"
              onClick={() => onSelectAvatar(pill.path)}
              disabled={controlsBusy}
              aria-label="Avatar option"
            >
              {pill.imageUrl ? (
                <div
                  className="profile-avatar-image"
                  style={{ backgroundImage: `url(${pill.imageUrl})` }}
                  aria-hidden="true"
                />
              ) : (
                <span className="profile-avatar-fallback" aria-hidden="true">
                  {solidaryAvatarFallback}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="form-actions profile-settings-actions">
        <button
          type="submit"
          className="primary"
          disabled={!hasChanges || controlsBusy || displayNameTooLong}
        >
          {saveBusy ? "Saving..." : "Save settings"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!hasChanges || controlsBusy}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
