import { Graph, type GraphConfigInterface } from "@cosmos.gl/graph";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { ExplorerConnection, ExplorerSite } from "../services/explorer-data";
import { buildConnectedSiteLookup } from "../services/explorer-graph";

type ExplorerGraphProps = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
  viewerSiteIds?: string[];
};

type PreparedGraphData = {
  pointSiteIds: string[];
  pointPositions: Float32Array;
  pointColors: Float32Array;
  pointSizes: Float32Array;
  links: Float32Array;
  linkCount: number;
  viewerPointIndices: number[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const GRAPH_SPACE_SIZE = 8192;
// Zoom floor for dense graphs. Practical range: 1-10.
const MIN_INITIAL_ZOOM_LEVEL = 5;
// Zoom ceiling for sparse graphs. Practical range: 1-10.
const MAX_INITIAL_ZOOM_LEVEL = 10;
// How fast initial zoom scales down as node count doubles.
// Range: 0+ (typical 0.4-1.2). Higher = faster zooming out.
const ZOOM_DECAY_PER_DOUBLING = 0.4;
// Initial simulation energy when graph first appears.
// Range: 0-1 (typical 0.01-0.08). Higher = faster/more visible drift.
const INITIAL_SIMULATION_ALPHA = 0.016;
// Simulation energy injected on later updates.
// Range: 0-1 (typical 0.002-0.03). Higher = more ongoing movement.
const UPDATE_SIMULATION_ALPHA = 0.005;
// Low ambient pulse so clusters keep subtle firefly-like motion over time.
// Range: 0-1 (typical 0.001-0.01). Lower = calmer drift.
const AMBIENT_SIMULATION_ALPHA = 0.0035;
// How often ambient motion pulses are injected.
// Range: milliseconds >= 100 (typical 800-4000). Higher = less frequent movement.
const AMBIENT_SIMULATION_INTERVAL_MS = 1800;
// Number of pre-render simulation ticks before first frame.
// Range: integer >= 0 (typical 16-120). Higher = calmer initial frame.
const INITIAL_SETTLE_STEPS = 72;
const POINT_CLOUD_RADIUS = GRAPH_SPACE_SIZE * 0.2;
// Delay before auto-pan logic starts.
// Range: milliseconds >= 0 (typical 0-3000).
const AUTO_PAN_INITIAL_DELAY_MS = 900;
// Length of the auto-pan camera move.
// Range: milliseconds >= 0 (typical 500-20000).
const AUTO_PAN_DURATION_MS = 9000;
// How often we check if a node has settled before panning.
// Range: milliseconds >= 16 (typical 100-500).
const AUTO_PAN_SETTLE_CHECK_MS = 260;
// Hard timeout for settle waiting.
// Range: milliseconds >= 0 (typical 2000-30000).
const AUTO_PAN_SETTLE_MAX_WAIT_MS = 12000;
// Number of consecutive low-motion samples required before pan.
// Range: integer >= 1 (typical 1-10). Higher = stricter settle requirement.
const AUTO_PAN_SETTLE_STABLE_SAMPLES = 5;
// Motion threshold (in graph-space units) treated as "stable."
// Range: >= 0 (typical 0.5-12). Lower = less drift tolerated.
const AUTO_PAN_SETTLE_DISTANCE_EPSILON = 6.2;
const DEFAULT_POINT_RGBA: [number, number, number, number] = [
  76 / 255,
  143 / 255,
  104 / 255,
  1
];

const getInitialZoomLevelForNodeCount = (nodeCount: number) => {
  if (nodeCount <= 1) {
    return MAX_INITIAL_ZOOM_LEVEL;
  }
  const zoomLevel =
    MAX_INITIAL_ZOOM_LEVEL - Math.log2(nodeCount) * ZOOM_DECAY_PER_DOUBLING;
  return clamp(zoomLevel, MIN_INITIAL_ZOOM_LEVEL, MAX_INITIAL_ZOOM_LEVEL);
};

const truncateLabel = (value: string) => {
  if (value.length <= 40) return value;
  return `${value.slice(0, 37)}...`;
};

const truncateDescription = (value: string) => {
  if (value.length <= 160) return value;
  return `${value.slice(0, 157)}...`;
};

const hashStringToUint32 = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const buildDeterministicPointPositions = (sites: ExplorerSite[], radius: number) => {
  const positions = new Float32Array(sites.length * 2);
  if (!sites.length) return positions;
  const center = GRAPH_SPACE_SIZE / 2;
  if (sites.length === 1) {
    positions[0] = center;
    positions[1] = center;
    return positions;
  }
  const maxUint32 = 0xffffffff;

  for (let index = 0; index < sites.length; index += 1) {
    const siteId = sites[index]?.id ?? `${index}`;
    const radialUnit = hashStringToUint32(`${siteId}:radius`) / maxUint32;
    const angleUnit = hashStringToUint32(`${siteId}:angle`) / maxUint32;
    const radialDistance = Math.sqrt(radialUnit) * radius;
    const angle = angleUnit * Math.PI * 2;
    positions[index * 2] = clamp(center + Math.cos(angle) * radialDistance, 0, GRAPH_SPACE_SIZE);
    positions[index * 2 + 1] = clamp(center + Math.sin(angle) * radialDistance, 0, GRAPH_SPACE_SIZE);
  }

  return positions;
};

const buildPreparedGraphData = ({
  sites,
  connections,
  viewerSiteIds
}: {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
  viewerSiteIds: string[];
}): PreparedGraphData => {
  const siteIdToIndex = new Map<string, number>();
  const pointSiteIds = sites.map((site, index) => {
    siteIdToIndex.set(site.id, index);
    return site.id;
  });
  const viewerSiteIdSet = new Set(
    viewerSiteIds
      .map((siteId) => siteId.trim())
      .filter((siteId) => siteId.length > 0)
  );

  const connectedBySiteId = buildConnectedSiteLookup(connections);
  const pointColors = new Float32Array(sites.length * 4);
  const pointSizes = new Float32Array(sites.length);
  const viewerPointIndices: number[] = [];
  sites.forEach((site, index) => {
    const isViewerSite = viewerSiteIdSet.has(site.id);
    if (isViewerSite) {
      viewerPointIndices.push(index);
    }
    pointColors[index * 4] = DEFAULT_POINT_RGBA[0];
    pointColors[index * 4 + 1] = DEFAULT_POINT_RGBA[1];
    pointColors[index * 4 + 2] = DEFAULT_POINT_RGBA[2];
    pointColors[index * 4 + 3] = DEFAULT_POINT_RGBA[3];

    const degree = connectedBySiteId[site.id]?.size ?? 0;
    pointSizes[index] = clamp(4 + Math.log2(degree + 1) * 1.3, 4, 13);
  });

  const linkValues: number[] = [];
  const seen = new Set<string>();
  connections.forEach((connection) => {
    const sourceIndex = siteIdToIndex.get(connection.sourceSiteId);
    const targetIndex = siteIdToIndex.get(connection.targetSiteId);
    if (sourceIndex === undefined || targetIndex === undefined) return;
    if (sourceIndex === targetIndex) return;
    const left = sourceIndex < targetIndex ? sourceIndex : targetIndex;
    const right = sourceIndex < targetIndex ? targetIndex : sourceIndex;
    const key = `${left}:${right}`;
    if (seen.has(key)) return;
    seen.add(key);
    linkValues.push(sourceIndex, targetIndex);
  });

  return {
    pointSiteIds,
    pointPositions: buildDeterministicPointPositions(sites, POINT_CLOUD_RADIUS),
    pointColors,
    pointSizes,
    links: new Float32Array(linkValues),
    linkCount: linkValues.length / 2,
    viewerPointIndices
  };
};

export default function ExplorerGraph({
  sites,
  connections,
  viewerSiteIds = []
}: ExplorerGraphProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const hasInitializedDataRef = useRef(false);
  const autoPanTimeoutRef = useRef<number | null>(null);
  const autoPanSettleIntervalRef = useRef<number | null>(null);
  const ambientSimulationIntervalRef = useRef<number | null>(null);
  const viewerBeaconFrameRef = useRef<number | null>(null);
  const userInteractedRef = useRef(false);
  const infoCardRef = useRef<HTMLElement | null>(null);
  const viewerBeaconRef = useRef<HTMLDivElement | null>(null);
  const pointSiteIdsRef = useRef<string[]>([]);
  const [shellSize, setShellSize] = useState({ width: 960, height: 620 });
  const [selectedPointInfo, setSelectedPointInfo] = useState<{
    siteId: string;
    anchorX: number;
    anchorY: number;
    nonce: number;
  } | null>(null);
  const [isPointHovered, setIsPointHovered] = useState(false);

  const siteById = useMemo(() => {
    const map: Record<string, ExplorerSite> = {};
    sites.forEach((site) => {
      map[site.id] = site;
    });
    return map;
  }, [sites]);

  const graphData = useMemo(
    () =>
      buildPreparedGraphData({
        sites,
        connections,
        viewerSiteIds
      }),
    [connections, sites, viewerSiteIds]
  );

  const resolveAnchorFromEvent = useCallback((event: MouseEvent) => {
    const shell = shellRef.current;
    if (!shell) return { x: 18, y: 18 };
    const rect = shell.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 8, Math.max(8, rect.width - 8));
    const y = clamp(event.clientY - rect.top, 8, Math.max(8, rect.height - 8));
    return { x, y };
  }, []);

  const openSiteInfoByPointIndex = useCallback(
    (index: number, event: MouseEvent) => {
      const siteId = pointSiteIdsRef.current[index] ?? "";
      if (!siteId) return;
      const anchor = resolveAnchorFromEvent(event);
      setSelectedPointInfo((current) => ({
        siteId,
        anchorX: anchor.x,
        anchorY: anchor.y,
        nonce: (current?.nonce ?? 0) + 1
      }));
    },
    [resolveAnchorFromEvent]
  );

  const clearSelectedInfo = useCallback(() => {
    setSelectedPointInfo((current) => (current ? null : current));
  }, []);

  const clearAutoPanTimers = useCallback(() => {
    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
      autoPanTimeoutRef.current = null;
    }
    if (autoPanSettleIntervalRef.current !== null) {
      window.clearInterval(autoPanSettleIntervalRef.current);
      autoPanSettleIntervalRef.current = null;
    }
  }, []);

  const clearAmbientSimulationLoop = useCallback(() => {
    if (ambientSimulationIntervalRef.current === null) return;
    window.clearInterval(ambientSimulationIntervalRef.current);
    ambientSimulationIntervalRef.current = null;
  }, []);

  const clearViewerBeaconLoop = useCallback(() => {
    if (viewerBeaconFrameRef.current !== null) {
      window.cancelAnimationFrame(viewerBeaconFrameRef.current);
      viewerBeaconFrameRef.current = null;
    }
  }, []);

  const startAmbientSimulationLoop = useCallback(() => {
    clearAmbientSimulationLoop();
    ambientSimulationIntervalRef.current = window.setInterval(() => {
      const graph = graphRef.current;
      if (!graph) return;
      graph.start(AMBIENT_SIMULATION_ALPHA);
    }, AMBIENT_SIMULATION_INTERVAL_MS);
  }, [clearAmbientSimulationLoop]);

  const markUserInteracted = useCallback(() => {
    userInteractedRef.current = true;
    clearAutoPanTimers();
  }, [clearAutoPanTimers]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const config: GraphConfigInterface = {
      attribution: "",
      spaceSize: GRAPH_SPACE_SIZE,
      backgroundColor: [255, 255, 255, 0],
      pointDefaultColor: "#4c8f68",
      pointDefaultSize: 4,
      pointOpacity: 0.96,
      pointSizeScale: 1,
      hoveredPointCursor: "pointer",
      renderLinks: true,
      linkDefaultColor: [31, 34, 28, 0.24],
      linkDefaultWidth: 1,
      linkOpacity: 0.7,
      hoveredLinkColor: "#1f221c",
      hoveredLinkWidthIncrease: 1.3,
      scalePointsOnZoom: false,
      scaleLinksOnZoom: false,
      enableZoom: true,
      enableDrag: true,
      enableSimulationDuringZoom: true,
      fitViewOnInit: false,
      initialZoomLevel: MAX_INITIAL_ZOOM_LEVEL,
      // Controls how quickly simulation energy decays.
      // Range: > 0 (typical 500-10000). Higher = drift lasts longer.
      simulationDecay: 24000,
      // Node-to-node repulsion force.
      // Range: >= 0 (typical 0.2-2.5). Higher = stronger push-apart motion.
      simulationRepulsion: 0.42,
      // Global pull toward center.
      // Range: >= 0 (typical 0-0.4). Higher = faster inward drift.
      simulationGravity: 0,
      // Additional centering bias.
      // Range: >= 0 (typical 0-0.15). Higher = tighter center lock.
      simulationCenter: 0,
      // Link spring stiffness.
      // Range: >= 0 (typical 0.1-1.2). Higher = links pull harder/faster.
      simulationLinkSpring: 0.72,
      // Target link length in graph-space units.
      // Range: > 0 (typical 4-80). Larger values spread linked nodes farther.
      simulationLinkDistance: 11,
      // Link-length randomization range.
      // Range: [min, max], both > 0 (typical [0.8, 1.6]).
      simulationLinkDistRandomVariationRange: [0.82, 1.75],
      // Velocity damping per tick.
      // Range: 0-1 (0 = heavy damping, 1 = almost no damping).
      simulationFriction: 0.97,
      onClick: (index) => {
        markUserInteracted();
        if (!Number.isInteger(index)) {
          clearSelectedInfo();
        }
      },
      onPointClick: (index, _pointPosition, event) => {
        markUserInteracted();
        openSiteInfoByPointIndex(index, event);
      },
      onPointMouseOver: () => {
        setIsPointHovered((current) => (current ? current : true));
      },
      onPointMouseOut: () => {
        setIsPointHovered((current) => (current ? false : current));
      },
      onDragStart: () => {
        setIsPointHovered(false);
      }
    };

    const graph = new Graph(shell, config);
    graphRef.current = graph;
    return () => {
      clearAutoPanTimers();
      clearAmbientSimulationLoop();
      clearViewerBeaconLoop();
      hasInitializedDataRef.current = false;
      graphRef.current = null;
      graph.destroy();
    };
  }, [
    clearAutoPanTimers,
    clearAmbientSimulationLoop,
    clearViewerBeaconLoop,
    clearSelectedInfo,
    markUserInteracted,
    openSiteInfoByPointIndex
  ]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const onUserPointerDown = () => {
      markUserInteracted();
    };
    const onUserWheel = () => {
      markUserInteracted();
    };

    shell.addEventListener("pointerdown", onUserPointerDown);
    shell.addEventListener("wheel", onUserWheel, { passive: true });

    return () => {
      shell.removeEventListener("pointerdown", onUserPointerDown);
      shell.removeEventListener("wheel", onUserWheel);
    };
  }, [markUserInteracted]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const syncSize = () => {
      const rect = shell.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setShellSize({
        width: rect.width,
        height: rect.height
      });
    };

    syncSize();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            syncSize();
          });
    resizeObserver?.observe(shell);
    window.addEventListener("resize", syncSize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    clearAutoPanTimers();
    clearAmbientSimulationLoop();
    pointSiteIdsRef.current = graphData.pointSiteIds;
    graph.setPointPositions(graphData.pointPositions);
    graph.setPointColors(graphData.pointColors);
    graph.setPointSizes(graphData.pointSizes);
    graph.setLinks(graphData.links);
    graph.render(0);

    if (!graphData.pointSiteIds.length) {
      hasInitializedDataRef.current = false;
      return;
    }

    if (!hasInitializedDataRef.current) {
      userInteractedRef.current = false;
      graph.stop();
      if (graphData.pointSiteIds.length === 1) {
        graph.zoomToPointByIndex(0, 0, MAX_INITIAL_ZOOM_LEVEL, false);
        graph.render(0);
        hasInitializedDataRef.current = true;
        return;
      }
      const initialZoomLevel = getInitialZoomLevelForNodeCount(
        graphData.pointSiteIds.length
      );
      // Start broad, then gently travel toward the user's site.
      graph.fitView(0, 0.16);
      graph.setZoomLevel(initialZoomLevel, 0);
      for (let stepIndex = 0; stepIndex < INITIAL_SETTLE_STEPS; stepIndex += 1) {
        graph.step();
      }
      graph.render(0);
      graph.start(INITIAL_SIMULATION_ALPHA);
      startAmbientSimulationLoop();
      if (graphData.viewerPointIndices.length) {
        const targetIndex = graphData.viewerPointIndices[0] ?? -1;
        if (targetIndex >= 0) {
          autoPanTimeoutRef.current = window.setTimeout(() => {
            autoPanTimeoutRef.current = null;
            if (userInteractedRef.current) return;
            const settleStartedAt = performance.now();
            let stableSamples = 0;
            let previousX: number | null = null;
            let previousY: number | null = null;

            const maybePanToTarget = () => {
              if (userInteractedRef.current) {
                clearAutoPanTimers();
                return;
              }

              const activeGraph = graphRef.current;
              if (!activeGraph) {
                clearAutoPanTimers();
                return;
              }

              const positions = activeGraph.getPointPositions();
              const x = positions[targetIndex * 2];
              const y = positions[targetIndex * 2 + 1];
              if (Number.isFinite(x) && Number.isFinite(y) && previousX !== null && previousY !== null) {
                const motion = Math.hypot(x - previousX, y - previousY);
                stableSamples =
                  motion <= AUTO_PAN_SETTLE_DISTANCE_EPSILON ? stableSamples + 1 : 0;
              }

              if (Number.isFinite(x) && Number.isFinite(y)) {
                previousX = x;
                previousY = y;
              }

              const hitMaxWait =
                performance.now() - settleStartedAt >= AUTO_PAN_SETTLE_MAX_WAIT_MS;
              const settledEnough = stableSamples >= AUTO_PAN_SETTLE_STABLE_SAMPLES;
              if (!hitMaxWait && !settledEnough) {
                return;
              }

              if (autoPanSettleIntervalRef.current !== null) {
                window.clearInterval(autoPanSettleIntervalRef.current);
                autoPanSettleIntervalRef.current = null;
              }

              const currentZoomLevel = activeGraph.getZoomLevel();
              activeGraph.zoomToPointByIndex(
                targetIndex,
                AUTO_PAN_DURATION_MS,
                currentZoomLevel,
                false
              );
            };

            autoPanSettleIntervalRef.current = window.setInterval(
              maybePanToTarget,
              AUTO_PAN_SETTLE_CHECK_MS
            );
            maybePanToTarget();
          }, AUTO_PAN_INITIAL_DELAY_MS);
        }
      }
      hasInitializedDataRef.current = true;
      return;
    }

    // New batch arrived: preserve camera and just inject a little energy for subtle rearrangement.
    graph.start(UPDATE_SIMULATION_ALPHA);
    if (graphData.pointSiteIds.length > 1) {
      startAmbientSimulationLoop();
    }
  }, [clearAutoPanTimers, clearAmbientSimulationLoop, graphData, startAmbientSimulationLoop]);

  useEffect(() => {
    const graph = graphRef.current;
    const beacon = viewerBeaconRef.current;
    if (!graph || !beacon) return;

    clearViewerBeaconLoop();
    const beaconIndex = graphData.viewerPointIndices[0];
    if (!Number.isInteger(beaconIndex)) {
      beacon.style.opacity = "0";
      return;
    }

    const frame = () => {
      const activeGraph = graphRef.current;
      const activeBeacon = viewerBeaconRef.current;
      if (!activeGraph || !activeBeacon) {
        return;
      }
      const positions = activeGraph.getPointPositions();
      const x = positions[beaconIndex * 2];
      const y = positions[beaconIndex * 2 + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const [screenX, screenY] = activeGraph.spaceToScreenPosition([x, y]);
        activeBeacon.style.transform = `translate(${Math.round(screenX)}px, ${Math.round(screenY)}px)`;
        activeBeacon.style.opacity = "1";
      } else {
        activeBeacon.style.opacity = "0";
      }
      viewerBeaconFrameRef.current = window.requestAnimationFrame(frame);
    };

    viewerBeaconFrameRef.current = window.requestAnimationFrame(frame);
    return () => {
      clearViewerBeaconLoop();
    };
  }, [clearViewerBeaconLoop, graphData.viewerPointIndices]);

  const selectedSite = selectedPointInfo ? siteById[selectedPointInfo.siteId] : null;
  const infoCardStyle: CSSProperties | undefined = useMemo(() => {
    if (!selectedPointInfo || !selectedSite) return undefined;

    const safePadding = 10;
    const minWidth = 250;
    const maxWidth = 360;
    const desiredWidth = clamp(shellSize.width * 0.38, minWidth, maxWidth);
    const width = clamp(desiredWidth, minWidth, Math.max(minWidth, shellSize.width - safePadding * 2));
    const estimatedHeight = 210;

    let left = selectedPointInfo.anchorX + 14;
    if (left + width > shellSize.width - safePadding) {
      left = selectedPointInfo.anchorX - width - 14;
    }
    left = clamp(left, safePadding, Math.max(safePadding, shellSize.width - width - safePadding));

    let top = selectedPointInfo.anchorY + 14;
    if (top + estimatedHeight > shellSize.height - safePadding) {
      top = selectedPointInfo.anchorY - estimatedHeight - 14;
    }
    top = clamp(top, safePadding, Math.max(safePadding, shellSize.height - estimatedHeight - safePadding));

    return {
      width: `${Math.floor(width)}px`,
      left: `${Math.floor(left)}px`,
      top: `${Math.floor(top)}px`,
      "--origin-x": `${Math.floor(selectedPointInfo.anchorX - left)}px`,
      "--origin-y": `${Math.floor(selectedPointInfo.anchorY - top)}px`
    } as CSSProperties;
  }, [selectedPointInfo, selectedSite, shellSize.height, shellSize.width]);

  const handleShellPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectedPointInfo) return;
    const card = infoCardRef.current;
    if (card && card.contains(event.target as Node)) return;
    clearSelectedInfo();
  };

  return (
    <section className="explorer-panel explorer-panel-graph">
      <div
        className={`explorer-graph-shell${isPointHovered ? " explorer-graph-shell-point-hovered" : ""}`}
        ref={shellRef}
        onPointerDownCapture={handleShellPointerDown}
      >
        <div className="explorer-viewer-beacon" aria-hidden="true" ref={viewerBeaconRef}>
          <span />
          <span />
        </div>
        {selectedSite && selectedPointInfo && (
          <article
            className="explorer-hover-card"
            key={`${selectedSite.id}:${selectedPointInfo.nonce}`}
            style={infoCardStyle}
            ref={infoCardRef}
          >
            <div className="explorer-hover-card-image-wrap">
              {selectedSite.imageUrl ? (
                <img
                  className="explorer-hover-card-image"
                  src={selectedSite.imageUrl}
                  alt={truncateLabel(selectedSite.title)}
                  loading="lazy"
                />
              ) : (
                <div className="explorer-hover-card-image explorer-hover-card-image-placeholder">
                  {selectedSite.title.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="explorer-hover-card-body">
              <h4>{truncateLabel(selectedSite.title)}</h4>
              <p>
                {selectedSite.description
                  ? truncateDescription(selectedSite.description)
                  : "No description provided."}
              </p>
              {selectedSite.canonicalUrl && (
                <a href={selectedSite.canonicalUrl} target="_blank" rel="noreferrer">
                  Visit site
                </a>
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
