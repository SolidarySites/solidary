import { useEffect, useState } from "react";
import {
  loadPublicNetwork,
  type PublicNetworkNode,
} from "../../../services/public-network";

export const useLandingRouteController = () => {
  const [nodes, setNodes] = useState<PublicNetworkNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextNodes = await loadPublicNetwork();
        if (cancelled) return;
        setNodes(nextNodes);
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error && caught.message.trim()
            ? caught.message
            : "Failed to load the public network.";
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
    nodes,
    loading,
    error,
  };
};
