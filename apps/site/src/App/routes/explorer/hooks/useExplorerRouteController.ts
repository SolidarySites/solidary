import { useEffect, useMemo, useState } from "react";
import { loadExplorerData, type ExplorerConnection, type ExplorerSite } from "../services/explorer-data";

const normalize = (value: string) => value.trim().toLowerCase();

export const useExplorerRouteController = () => {
  const [allSites, setAllSites] = useState<ExplorerSite[]>([]);
  const [allConnections, setAllConnections] = useState<ExplorerConnection[]>([]);
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
        setAllSites(data.sites);
        setAllConnections(data.connections);
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

  const listSites = useMemo(() => {
    const query = normalize(searchQuery);
    if (!query) return allSites;
    return allSites.filter((site) => {
      const haystack = `${site.title} ${site.description} ${site.canonicalUrl}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [allSites, searchQuery]);

  return {
    loading,
    error,
    searchQuery,
    sites: allSites,
    connections: allConnections,
    listSites,
    totalNodeCount: allSites.length,
    totalSiteCount: allSites.length,
    totalConnectionCount: allConnections.length,
    onSearchQueryChange: setSearchQuery
  };
};
