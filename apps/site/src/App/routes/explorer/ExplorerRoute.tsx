import { useEffect, useState } from "react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import ExplorerGraph from "./components/ExplorerGraph";
import { useExplorerRouteController } from "./hooks/useExplorerRouteController";
import { loadViewerSiteIdsForUser } from "./services/explorer-data";
import "./ExplorerRoute.css";

export default function ExplorerRoute() {
  const { session, sessionResolved } = useAuth();
  const controller = useExplorerRouteController();
  const [viewerSiteIds, setViewerSiteIds] = useState<string[]>([]);
  const [viewerSitesResolved, setViewerSitesResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!sessionResolved) {
      setViewerSiteIds([]);
      setViewerSitesResolved(false);
      return () => {
        cancelled = true;
      };
    }

    if (!session) {
      setViewerSiteIds([]);
      setViewerSitesResolved(true);
      return () => {
        cancelled = true;
      };
    }

    setViewerSitesResolved(false);
    void (async () => {
      try {
        const ownedSiteIds = await loadViewerSiteIdsForUser(session.user.id);
        if (cancelled) return;
        setViewerSiteIds(ownedSiteIds);
      } catch {
        if (cancelled) return;
        setViewerSiteIds([]);
      } finally {
        if (!cancelled) {
          setViewerSitesResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, sessionResolved]);

  const isGraphReady =
    !controller.loading && !controller.error && viewerSitesResolved;
  const isLoading = !controller.error && (!viewerSitesResolved || controller.loading);

  return (
    <div className="app-shell explorer-app-shell">
      <main className="main-content explorer-main-content">
        {isGraphReady && (
          <ExplorerGraph
            sites={controller.sites}
            connections={controller.connections}
            viewerSiteIds={viewerSiteIds}
          />
        )}
        {controller.error && (
          <section className="explorer-panel">
            <p className="explorer-error">{controller.error}</p>
          </section>
        )}
        {isLoading && (
          <section className="explorer-panel explorer-loading-panel">
            <p>Loading graph data...</p>
          </section>
        )}
      </main>
    </div>
  );
}
