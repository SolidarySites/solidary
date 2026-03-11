import type { ComponentProps } from "react";
import ProfileConnectedGithubCard from "./ProfileConnectedGithubCard";
import ProfileSupabaseConnectionCard from "./ProfileSupabaseConnectionCard";

type ProfileAuthenticationSectionProps = {
  expanded: boolean;
  onToggle: () => void;
  githubCardProps: ComponentProps<typeof ProfileConnectedGithubCard>;
  supabaseCardProps: ComponentProps<typeof ProfileSupabaseConnectionCard>;
};

export default function ProfileAuthenticationSection({
  expanded,
  onToggle,
  githubCardProps,
  supabaseCardProps
}: ProfileAuthenticationSectionProps) {
  return (
    <section className="profile-authentication-panel" aria-labelledby="profile-authentication-title">
      <button
        type="button"
        className="profile-authentication-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="profile-authentication-content"
      >
        <span id="profile-authentication-title" className="profile-authentication-heading">
          Authentication
        </span>
        <span className="profile-authentication-toggle-mark" aria-hidden="true">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded ? (
        <div id="profile-authentication-content" className="profile-authentication-content">
          <ProfileConnectedGithubCard {...githubCardProps} />
          <ProfileSupabaseConnectionCard {...supabaseCardProps} />
        </div>
      ) : null}
    </section>
  );
}
