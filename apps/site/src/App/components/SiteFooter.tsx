import { isSupabaseConfigured } from "../lib/supabase";
import type { NoticeKind } from "../types/notice";
import "./SiteFooter.css";

type SiteFooterProps = {
  notice: string | null;
  noticeKind: NoticeKind;
};

export default function SiteFooter({ notice, noticeKind }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      {!isSupabaseConfigured() && (
        <div className="warning">
          Add <code>VITE_SUPABASE_PROJECT_ID</code> and
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to
          <code>.env</code> before signing in.
        </div>
      )}
      {notice && (
        <div className={noticeKind === "error" ? "error" : "notice"}>{notice}</div>
      )}
    </footer>
  );
}
