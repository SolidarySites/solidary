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
const INITIAL_ZOOM_LEVEL = 4.5;
const INITIAL_SIMULATION_ALPHA = 0.035;
const UPDATE_SIMULATION_ALPHA = 0.012;
const INITIAL_SETTLE_STEPS = 72;
const POINT_CLOUD_RADIUS = GRAPH_SPACE_SIZE * 0.2;
const AUTO_PAN_INITIAL_DELAY_MS = 900;
const AUTO_PAN_DURATION_MS = 9000;
const AUTO_PAN_SETTLE_CHECK_MS = 260;
const AUTO_PAN_SETTLE_MAX_WAIT_MS = 12000;
const AUTO_PAN_SETTLE_STABLE_SAMPLES = 2;
const AUTO_PAN_SETTLE_DISTANCE_EPSILON = 6.2;
const DEFAULT_POINT_RGBA: [number, number, number, number] = [
  76 / 255,
  143 / 255,
  104 / 255,
  1
];
const VIEWER_POINT_RGBA: [number, number, number, number] = [
  242 / 255,
  212 / 255,
  81 / 255,
  1
];

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
    const color = isViewerSite ? VIEWER_POINT_RGBA : DEFAULT_POINT_RGBA;
    pointColors[index * 4] = color[0];
    pointColors[index * 4 + 1] = color[1];
    pointColors[index * 4 + 2] = color[2];
    pointColors[index * 4 + 3] = color[3];

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
  const userInteractedRef = useRef(false);
  const infoCardRef = useRef<HTMLElement | null>(null);
  const pointSiteIdsRef = useRef<string[]>([]);
  const [shellSize, setShellSize] = useState({ width: 960, height: 620 });
  const [selectedPointInfo, setSelectedPointInfo] = useState<{
    siteId: string;
    anchorX: number;
    anchorY: number;
    nonce: number;
  } | null>(null);

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
      initialZoomLevel: INITIAL_ZOOM_LEVEL,
      simulationDecay: 4200,
      simulationRepulsion: 0.52,
      simulationGravity: 0.1,
      simulationCenter: 0.025,
      simulationLinkSpring: 0.32,
      simulationLinkDistance: 18,
      onClick: (index) => {
        markUserInteracted();
        if (!Number.isInteger(index)) {
          clearSelectedInfo();
        }
      },
      onPointClick: (index, _pointPosition, event) => {
        markUserInteracted();
        openSiteInfoByPointIndex(index, event);
      }
    };

    const graph = new Graph(shell, config);
    graphRef.current = graph;
    return () => {
      clearAutoPanTimers();
      hasInitializedDataRef.current = false;
      graphRef.current = null;
      graph.destroy();
    };
  }, [clearAutoPanTimers, clearSelectedInfo, markUserInteracted, openSiteInfoByPointIndex]);

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
      // Start broad, then gently travel toward the user's site.
      graph.fitView(0, 0.16);
      graph.setZoomLevel(INITIAL_ZOOM_LEVEL, 0);
      for (let stepIndex = 0; stepIndex < INITIAL_SETTLE_STEPS; stepIndex += 1) {
        graph.step();
      }
      graph.render(0);
      graph.start(INITIAL_SIMULATION_ALPHA);
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
  }, [clearAutoPanTimers, graphData]);

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
      <div className="explorer-graph-shell" ref={shellRef} onPointerDownCapture={handleShellPointerDown}>
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
