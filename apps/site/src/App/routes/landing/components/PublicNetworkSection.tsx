import type { PublicNetworkNode } from "../../../services/public-network";
import { PublicNetworkCard } from "./PublicNetworkCard";

type PublicNetworkSectionProps = {
  nodes: PublicNetworkNode[];
  loading: boolean;
  error: string | null;
};

const formatNodeSummary = (nodes: PublicNetworkNode[]) => {
  const siteCount = nodes.filter((node) => node.nodeType === "site").length;
  const indexCount = nodes.length - siteCount;
  const siteLabel = `${siteCount} site${siteCount === 1 ? "" : "s"}`;
  const indexLabel = `${indexCount} index${indexCount === 1 ? "" : "es"}`;
  return `${siteLabel} / ${indexLabel} mirrored locally`;
};

export function PublicNetworkSection({
  nodes,
  loading,
  error,
}: PublicNetworkSectionProps) {
  const metaLabel = loading
    ? "Updating public network"
    : error
      ? "Public network unavailable"
      : formatNodeSummary(nodes);

  return (
    <section
      id="public-network"
      className="landing-sites-section"
      aria-labelledby="public-network-title"
    >
      <div className="landing-section-header">
        <div className="landing-section-title-block">
          <h2 id="public-network-title">
            Public network visible from this index.
          </h2>
        </div>
        <p className="landing-section-meta">{metaLabel}</p>
      </div>

      {loading && (
        <div className="landing-status-panel" aria-live="polite">
          <p>Loading mirrored sites and indexes...</p>
        </div>
      )}

      {!loading && error && (
        <div className="landing-status-panel landing-status-panel-error" role="alert">
          <p>Could not load the mirrored network right now.</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !nodes.length && (
        <div className="landing-status-panel">
          <p>No mirrored sites or indexes are visible yet.</p>
        </div>
      )}

      {!loading && !error && nodes.length > 0 && (
        <div className="landing-sites-grid">
          {nodes.map((node) => (
            <PublicNetworkCard key={node.id} node={node} />
          ))}
        </div>
      )}
    </section>
  );
}
