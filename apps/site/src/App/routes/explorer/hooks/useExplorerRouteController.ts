import { useEffect, useMemo, useState } from "react";
import { loadExplorerData, type ExplorerConnection, type ExplorerSite } from "../services/explorer-data";

const normalize = (value: string) => value.trim().toLowerCase();

export const useExplorerRouteController = () => {
  const [sites, setSites] = useState<ExplorerSite[]>([]);
  const [connections, setConnections] = useState<ExplorerConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await loadExplorerData();
        if (cancelled) return;
        setSites(data.sites);
        setConnections(data.connections);
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error && caught.message.trim()
            ? caught.message
            : "Failed to load explorer data.";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSites = useMemo(() => {
    const query = normalize(searchQuery);
    if (!query) return sites;
    return sites.filter((site) => {
      const haystack = `${site.title} ${site.description} ${site.canonicalUrl}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, sites]);

  const filteredSiteIds = useMemo(
    () => new Set(filteredSites.map((site) => site.id)),
    [filteredSites]
  );

  const filteredConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          filteredSiteIds.has(connection.sourceSiteId) &&
          filteredSiteIds.has(connection.targetSiteId)
      ),
    [connections, filteredSiteIds]
  );

  return {
    loading,
    error,
    searchQuery,
    filteredSites,
    filteredConnections,
    totalSiteCount: sites.length,
    totalConnectionCount: connections.length,
    onSearchQueryChange: setSearchQuery
  };
};
