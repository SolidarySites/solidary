import { useEffect, useMemo, useRef, useState } from "react";
import type { ExplorerConnection, ExplorerSite } from "../services/explorer-data";
import {
  buildConnectedSiteLookup,
  buildExplorerGraph
} from "../services/explorer-graph";

type ExplorerGraphProps = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const toNodeColor = (degree: number) => {
  const lightness = clamp(64 - degree * 3, 34, 64);
  return `hsl(152 34% ${lightness}%)`;
};

const truncateLabel = (value: string) => {
  if (value.length <= 22) return value;
  return `${value.slice(0, 19)}...`;
};

export default function ExplorerGraph({ sites, connections }: ExplorerGraphProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [shellWidth, setShellWidth] = useState(960);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const syncWidth = () => {
      const next = Math.floor(shell.getBoundingClientRect().width);
      if (next > 0) setShellWidth(next);
    };

    syncWidth();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            syncWidth();
          });
    resizeObserver?.observe(shell);
    window.addEventListener("resize", syncWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncWidth);
    };
  }, []);

  const width = Math.max(320, shellWidth);
  const height = clamp(300 + Math.ceil(sites.length / 10) * 34, 360, 680);
  const graph = useMemo(
    () =>
      buildExplorerGraph({
        sites,
        connections,
        width,
        height
      }),
    [connections, height, sites, width]
  );
  const connectedBySiteId = useMemo(
    () => buildConnectedSiteLookup(connections),
    [connections]
  );

  if (!sites.length) {
    return (
      <section className="explorer-panel">
        <div className="section-header">
          <h3>Connection graph</h3>
          <p>No sites to display yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="explorer-panel">
      <div className="section-header">
        <h3>Connection graph</h3>
        <p>Each node is a site. Lines show approved site-to-site connections.</p>
      </div>

      <div className="explorer-graph-shell" ref={shellRef}>
        <svg
          className="explorer-graph"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Network graph of sites and approved connections"
        >
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
          {graph.edges.map((edge) => {
            const isHoveredConnection =
              hoveredSiteId &&
              (edge.sourceSiteId === hoveredSiteId || edge.targetSiteId === hoveredSiteId);
            return (
              <line
                key={edge.key}
                x1={edge.sourceX}
                y1={edge.sourceY}
                x2={edge.targetX}
                y2={edge.targetY}
                stroke="rgba(31, 34, 28, 0.26)"
                strokeWidth={isHoveredConnection ? 2 : 1}
                opacity={hoveredSiteId ? (isHoveredConnection ? 0.9 : 0.22) : 0.58}
              />
            );
          })}

          {graph.nodes.map((node) => {
            const connectedSet = connectedBySiteId[node.siteId];
            const isHovered = hoveredSiteId === node.siteId;
            const isAdjacent = Boolean(hoveredSiteId && connectedSet?.has(hoveredSiteId));
            const isDimmed = Boolean(hoveredSiteId && !isHovered && !isAdjacent);
            const shouldShowLabel = graph.nodes.length <= 22 || isHovered;
            return (
              <g
                key={node.siteId}
                transform={`translate(${node.x} ${node.y})`}
                onMouseEnter={() => setHoveredSiteId(node.siteId)}
                onMouseLeave={() => setHoveredSiteId((current) => (current === node.siteId ? null : current))}
              >
                <circle
                  r={node.radius}
                  fill={toNodeColor(node.degree)}
                  stroke="rgba(31, 34, 28, 0.5)"
                  strokeWidth={isHovered ? 2.4 : 1}
                  opacity={isDimmed ? 0.3 : 0.95}
                />
                {shouldShowLabel && (
                  <text
                    className="explorer-graph-label"
                    x={node.radius + 4}
                    y={4}
                    opacity={isDimmed ? 0.35 : 0.95}
                  >
                    {truncateLabel(node.title)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
