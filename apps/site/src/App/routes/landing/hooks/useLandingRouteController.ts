import { useEffect, useState } from "react";
import { loadPublicSites, type PublicSite } from "../../../services/public-sites";

export const useLandingRouteController = () => {
  const [sites, setSites] = useState<PublicSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextSites = await loadPublicSites();
        if (cancelled) return;
        setSites(nextSites);
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error && caught.message.trim()
            ? caught.message
            : "Failed to load published sites.";
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

  return {
    sites,
    loading,
    error,
  };
};
