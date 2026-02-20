import type { ExplorerConnection, ExplorerSite } from "./explorer-data";

export type ExplorerGraphNode = {
  siteId: string;
  title: string;
  canonicalUrl: string;
  x: number;
  y: number;
  degree: number;
  radius: number;
};

export type ExplorerGraphEdge = {
  key: string;
  sourceSiteId: string;
  targetSiteId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type ExplorerGraph = {
  nodes: ExplorerGraphNode[];
  edges: ExplorerGraphEdge[];
  degreeBySiteId: Record<string, number>;
};

export type ExplorerGraphIndex = {
  sitesById: Record<string, ExplorerSite>;
  siteIds: string[];
  normalizedConnections: ExplorerConnection[];
  adjacencyBySiteId: Record<string, string[]>;
  degreeBySiteId: Record<string, number>;
};

export type ExplorerLoadedGraphState = {
  nodesById: Record<string, ExplorerGraphNode>;
  loadedSiteIds: string[];
  randomCursor: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clampInt = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

const normalizeConnections = (connections: ExplorerConnection[]): ExplorerConnection[] => {
  const seen = new Set<string>();
  const normalized: ExplorerConnection[] = [];
  for (const connection of connections) {
    if (connection.sourceSiteId === connection.targetSiteId) continue;
    const left =
      connection.sourceSiteId < connection.targetSiteId
        ? connection.sourceSiteId
        : connection.targetSiteId;
    const right =
      connection.sourceSiteId < connection.targetSiteId
        ? connection.targetSiteId
        : connection.sourceSiteId;
    const key = `${left}:${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(connection);
  }
  return normalized;
};

export const buildConnectedSiteLookup = (connections: ExplorerConnection[]) => {
  const connectedBySiteId: Record<string, Set<string>> = {};
  normalizeConnections(connections).forEach((connection) => {
    if (!connectedBySiteId[connection.sourceSiteId]) {
      connectedBySiteId[connection.sourceSiteId] = new Set<string>();
    }
    if (!connectedBySiteId[connection.targetSiteId]) {
      connectedBySiteId[connection.targetSiteId] = new Set<string>();
    }
    connectedBySiteId[connection.sourceSiteId]?.add(connection.targetSiteId);
    connectedBySiteId[connection.targetSiteId]?.add(connection.sourceSiteId);
  });
  return connectedBySiteId;
};

export const buildExplorerGraphIndex = ({
  sites,
  connections
}: {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
}): ExplorerGraphIndex => {
  const sitesById: Record<string, ExplorerSite> = {};
  sites.forEach((site) => {
    sitesById[site.id] = site;
  });
  const siteIds = Object.keys(sitesById);

  const adjacencyBySiteId: Record<string, string[]> = {};
  siteIds.forEach((siteId) => {
    adjacencyBySiteId[siteId] = [];
  });

  const normalizedConnections = normalizeConnections(connections).filter(
    (connection) => Boolean(sitesById[connection.sourceSiteId] && sitesById[connection.targetSiteId])
  );
  normalizedConnections.forEach((connection) => {
    adjacencyBySiteId[connection.sourceSiteId]?.push(connection.targetSiteId);
    adjacencyBySiteId[connection.targetSiteId]?.push(connection.sourceSiteId);
  });

  const degreeBySiteId: Record<string, number> = {};
  siteIds.forEach((siteId) => {
    degreeBySiteId[siteId] = adjacencyBySiteId[siteId]?.length ?? 0;
  });

  return {
    sitesById,
    siteIds,
    normalizedConnections,
    adjacencyBySiteId,
    degreeBySiteId
  };
};

type GraphWorldSizeInput = {
  siteCount: number;
  viewportWidth: number;
  viewportHeight: number;
};

export const getExplorerGraphWorldSize = ({
  siteCount,
  viewportWidth,
  viewportHeight
}: GraphWorldSizeInput) => {
  const baseWidth = Math.max(viewportWidth * 2.2, 1200);
  const baseHeight = Math.max(viewportHeight * 2.2, 900);
  if (siteCount <= 0) {
    return {
      width: clampInt(baseWidth, 1200, 2400),
      height: clampInt(baseHeight, 900, 2200)
    };
  }

  const siteDensity = 1250;
  const areaFromSites = siteCount * siteDensity;
  const ratio = 1.6;
  const widthFromSites = Math.sqrt(areaFromSites * ratio);
  const heightFromSites = Math.sqrt(areaFromSites / ratio);

  return {
    width: clampInt(Math.max(baseWidth, widthFromSites), 1200, 26000),
    height: clampInt(Math.max(baseHeight, heightFromSites), 900, 20000)
  };
};

const parseHexToUnitValues = (rawHex: string): number[] => {
  const cleaned = rawHex.replace(/[^0-9a-f]/gi, "");
  const values: number[] = [];
  for (let index = 0; index + 1 < cleaned.length; index += 2) {
    const pair = cleaned.slice(index, index + 2);
    const parsed = Number.parseInt(pair, 16);
    if (!Number.isNaN(parsed)) {
      values.push(parsed / 255);
    }
  }
  return values;
};

export const loadLocalRandomUnitValues = (count: number): number[] => {
  if (count <= 0) return [];
  const values = new Array<number>(count);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(count);
    crypto.getRandomValues(bytes);
    for (let index = 0; index < count; index += 1) {
      values[index] = (bytes[index] ?? 0) / 255;
    }
    return values;
  }
  for (let index = 0; index < count; index += 1) {
    values[index] = Math.random();
  }
  return values;
};

const loadQuantumRandomUnitValues = async (
  count: number,
  signal?: AbortSignal
): Promise<number[]> => {
  if (count <= 0) return [];
  const values: number[] = [];
  while (values.length < count) {
    const remaining = count - values.length;
    const hexLength = clampInt(remaining * 2, 256, 4096);
    const response = await fetch(
      `https://lfdr.de/qrng_api/qrng?length=${hexLength}&format=HEX`,
      {
        method: "GET",
        cache: "no-store",
        signal
      }
    );
    if (!response.ok) break;
    const payload = await response.text();
    const parsed = parseHexToUnitValues(payload);
    if (!parsed.length) break;
    values.push(...parsed);
  }
  return values.slice(0, count);
};

export const loadExplorerRandomUnitValues = async (count: number): Promise<number[]> => {
  if (count <= 0) return [];

  const timeoutMs = 1400;
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = globalThis.setTimeout(() => {
      controller?.abort();
    }, timeoutMs);
    const quantum = await loadQuantumRandomUnitValues(count, controller?.signal);
    globalThis.clearTimeout(timeoutId);
    if (quantum.length >= count) {
      return quantum.slice(0, count);
    }
    const fallback = loadLocalRandomUnitValues(count);
    if (!quantum.length) return fallback;
    const merged = fallback.slice();
    for (let index = 0; index < quantum.length; index += 1) {
      merged[index] = quantum[index] ?? merged[index] ?? 0;
    }
    return merged;
  } catch {
    return loadLocalRandomUnitValues(count);
  }
};

const getUnitRandom = (randomUnitValues: number[], cursor: number) => {
  if (!randomUnitValues.length) {
    return {
      value: Math.random(),
      nextCursor: cursor + 1
    };
  }
  const wrappedIndex =
    ((cursor % randomUnitValues.length) + randomUnitValues.length) % randomUnitValues.length;
  return {
    value: randomUnitValues[wrappedIndex] ?? 0,
    nextCursor: cursor + 1
  };
};

const getNodeRadius = (degree: number) => clamp(4.5 + degree * 1.1, 4.5, 14);

const makeNode = ({
  site,
  degree,
  x,
  y
}: {
  site: ExplorerSite;
  degree: number;
  x: number;
  y: number;
}): ExplorerGraphNode => ({
  siteId: site.id,
  title: site.title,
  canonicalUrl: site.canonicalUrl,
  x,
  y,
  degree,
  radius: getNodeRadius(degree)
});

const pickInitialSiteIds = ({
  index,
  initialCount,
  randomUnitValues,
  randomCursor
}: {
  index: ExplorerGraphIndex;
  initialCount: number;
  randomUnitValues: number[];
  randomCursor: number;
}) => {
  const targetCount = clampInt(initialCount, 0, index.siteIds.length);
  if (targetCount <= 0) {
    return {
      siteIds: [] as string[],
      randomCursor
    };
  }

  const selected = new Set<string>();
  const ranked = [...index.siteIds].sort((left, right) => {
    const leftDegree = index.degreeBySiteId[left] ?? 0;
    const rightDegree = index.degreeBySiteId[right] ?? 0;
    if (leftDegree !== rightDegree) return rightDegree - leftDegree;
    return left.localeCompare(right);
  });
  const hubTarget = clampInt(Math.ceil(targetCount * 0.35), 8, targetCount);
  for (let i = 0; i < hubTarget && i < ranked.length; i += 1) {
    selected.add(ranked[i] ?? "");
  }

  const pool = ranked.filter((siteId) => !selected.has(siteId));
  let cursor = randomCursor;
  while (selected.size < targetCount && pool.length) {
    const next = getUnitRandom(randomUnitValues, cursor);
    cursor = next.nextCursor;
    const poolIndex = clampInt(next.value * (pool.length - 1), 0, pool.length - 1);
    const [picked] = pool.splice(poolIndex, 1);
    if (picked) selected.add(picked);
  }

  return {
    siteIds: Array.from(selected),
    randomCursor: cursor
  };
};

const relaxLoadedGraph = ({
  nodesById,
  loadedSiteIds,
  adjacencyBySiteId,
  worldWidth,
  worldHeight,
  minDistance,
  iterations
}: {
  nodesById: Record<string, ExplorerGraphNode>;
  loadedSiteIds: string[];
  adjacencyBySiteId: Record<string, string[]>;
  worldWidth: number;
  worldHeight: number;
  minDistance: number;
  iterations: number;
}) => {
  type SimNode = ExplorerGraphNode & { vx: number; vy: number };
  const simNodesById: Record<string, SimNode> = {};
  loadedSiteIds.forEach((siteId) => {
    const node = nodesById[siteId];
    if (!node) return;
    simNodesById[siteId] = {
      ...node,
      vx: 0,
      vy: 0
    };
  });

  const loadedSet = new Set(loadedSiteIds);
  const springs: Array<{ sourceId: string; targetId: string }> = [];
  loadedSiteIds.forEach((siteId) => {
    const neighbors = adjacencyBySiteId[siteId] ?? [];
    neighbors.forEach((neighborId) => {
      if (!loadedSet.has(neighborId)) return;
      if (siteId >= neighborId) return;
      springs.push({
        sourceId: siteId,
        targetId: neighborId
      });
    });
  });

  const centerX = worldWidth / 2;
  const centerY = worldHeight / 2;
  const springStrength = loadedSiteIds.length > 4000 ? 0.009 : loadedSiteIds.length > 1500 ? 0.012 : 0.015;
  const centerStrength = 0.00038;
  const maxVelocity = loadedSiteIds.length > 3500 ? 7 : 9;
  const collisionPadding = Math.max(4, minDistance * 0.58);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const damping = 0.83 - (iteration / Math.max(1, iterations)) * 0.12;
    loadedSiteIds.forEach((siteId) => {
      const node = simNodesById[siteId];
      if (!node) return;
      node.vx *= damping;
      node.vy *= damping;
      node.vx += (centerX - node.x) * centerStrength;
      node.vy += (centerY - node.y) * centerStrength;
    });

    springs.forEach((spring) => {
      const source = simNodesById[spring.sourceId];
      const target = simNodesById[spring.targetId];
      if (!source || !target) return;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const desired = clamp(
        minDistance * 1.6 + Math.log2(Math.max(source.degree, target.degree) + 2) * 18,
        minDistance * 1.4,
        minDistance * 4
      );
      const stretch = distance - desired;
      const force = stretch * springStrength;
      const nx = dx / distance;
      const ny = dy / distance;
      source.vx += force * nx;
      source.vy += force * ny;
      target.vx -= force * nx;
      target.vy -= force * ny;
    });

    const cellSize = Math.max(22, minDistance + collisionPadding);
    const grid = new Map<string, string[]>();
    loadedSiteIds.forEach((siteId) => {
      const node = simNodesById[siteId];
      if (!node) return;
      const cellX = Math.floor(node.x / cellSize);
      const cellY = Math.floor(node.y / cellSize);
      const key = `${cellX}:${cellY}`;
      const entry = grid.get(key);
      if (entry) {
        entry.push(siteId);
      } else {
        grid.set(key, [siteId]);
      }
    });

    const neighborOffsets = [-1, 0, 1];
    loadedSiteIds.forEach((siteId) => {
      const node = simNodesById[siteId];
      if (!node) return;
      const cellX = Math.floor(node.x / cellSize);
      const cellY = Math.floor(node.y / cellSize);
      for (const offsetX of neighborOffsets) {
        for (const offsetY of neighborOffsets) {
          const key = `${cellX + offsetX}:${cellY + offsetY}`;
          const candidates = grid.get(key);
          if (!candidates) continue;
          for (const otherId of candidates) {
            if (otherId <= siteId) continue;
            const other = simNodesById[otherId];
            if (!other) continue;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
            const desired = node.radius + other.radius + minDistance + collisionPadding;
            if (distance >= desired) continue;
            const overlap = desired - distance;
            const nx = dx / distance;
            const ny = dy / distance;
            const correction = overlap * 0.52;
            node.x -= nx * correction;
            node.y -= ny * correction;
            other.x += nx * correction;
            other.y += ny * correction;
          }
        }
      }
    });

    loadedSiteIds.forEach((siteId) => {
      const node = simNodesById[siteId];
      if (!node) return;
      node.vx = clamp(node.vx, -maxVelocity, maxVelocity);
      node.vy = clamp(node.vy, -maxVelocity, maxVelocity);
      node.x = clamp(node.x + node.vx, 8, worldWidth - 8);
      node.y = clamp(node.y + node.vy, 8, worldHeight - 8);
    });
  }

  loadedSiteIds.forEach((siteId) => {
    const next = simNodesById[siteId];
    if (!next) return;
    nodesById[siteId] = {
      siteId: next.siteId,
      title: next.title,
      canonicalUrl: next.canonicalUrl,
      x: next.x,
      y: next.y,
      degree: next.degree,
      radius: next.radius
    };
  });
};

export const createInitialLoadedGraphState = ({
  index,
  randomUnitValues,
  initialCount,
  worldWidth,
  worldHeight,
  minDistance
}: {
  index: ExplorerGraphIndex;
  randomUnitValues: number[];
  initialCount: number;
  worldWidth: number;
  worldHeight: number;
  minDistance: number;
}): ExplorerLoadedGraphState => {
  if (!index.siteIds.length) {
    return {
      nodesById: {},
      loadedSiteIds: [],
      randomCursor: 0
    };
  }

  const initialPick = pickInitialSiteIds({
    index,
    initialCount,
    randomUnitValues,
    randomCursor: 0
  });
  let cursor = initialPick.randomCursor;
  const nodesById: Record<string, ExplorerGraphNode> = {};
  initialPick.siteIds.forEach((siteId) => {
    const site = index.sitesById[siteId];
    if (!site) return;
    const randomX = getUnitRandom(randomUnitValues, cursor);
    cursor = randomX.nextCursor;
    const randomY = getUnitRandom(randomUnitValues, cursor);
    cursor = randomY.nextCursor;
    nodesById[siteId] = makeNode({
      site,
      degree: index.degreeBySiteId[siteId] ?? 0,
      x: clamp(12 + randomX.value * (worldWidth - 24), 12, worldWidth - 12),
      y: clamp(12 + randomY.value * (worldHeight - 24), 12, worldHeight - 12)
    });
  });

  const loadedSiteIds = initialPick.siteIds.filter((siteId) => Boolean(nodesById[siteId]));
  relaxLoadedGraph({
    nodesById,
    loadedSiteIds,
    adjacencyBySiteId: index.adjacencyBySiteId,
    worldWidth,
    worldHeight,
    minDistance,
    iterations: clampInt(24 + Math.sqrt(loadedSiteIds.length) * 0.35, 20, 48)
  });

  return {
    nodesById,
    loadedSiteIds,
    randomCursor: cursor
  };
};

const getViewportRect = ({
  panX,
  panY,
  viewportWidth,
  viewportHeight
}: {
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
}) => {
  const left = -panX;
  const top = -panY;
  return {
    left,
    top,
    right: left + viewportWidth,
    bottom: top + viewportHeight,
    centerX: left + viewportWidth / 2,
    centerY: top + viewportHeight / 2
  };
};

const normalizeDirection = (direction: { x: number; y: number }) => {
  const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  if (length <= 0.0001) {
    return {
      x: 0,
      y: 0
    };
  }
  return {
    x: direction.x / length,
    y: direction.y / length
  };
};

type PlacementGrid = {
  cellSize: number;
  cells: Map<string, ExplorerGraphNode[]>;
};

const getPlacementCellKey = (x: number, y: number, cellSize: number) =>
  `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;

const addNodeToPlacementGrid = (grid: PlacementGrid, node: ExplorerGraphNode) => {
  const key = getPlacementCellKey(node.x, node.y, grid.cellSize);
  const entry = grid.cells.get(key);
  if (entry) {
    entry.push(node);
  } else {
    grid.cells.set(key, [node]);
  }
};

const buildPlacementGrid = ({
  nodesById,
  loadedSiteIds,
  cellSize
}: {
  nodesById: Record<string, ExplorerGraphNode>;
  loadedSiteIds: string[];
  cellSize: number;
}): PlacementGrid => {
  const grid: PlacementGrid = {
    cellSize,
    cells: new Map<string, ExplorerGraphNode[]>()
  };
  loadedSiteIds.forEach((siteId) => {
    const node = nodesById[siteId];
    if (!node) return;
    addNodeToPlacementGrid(grid, node);
  });
  return grid;
};

const hasPlacementConflict = ({
  grid,
  x,
  y,
  radius,
  minDistance
}: {
  grid: PlacementGrid;
  x: number;
  y: number;
  radius: number;
  minDistance: number;
}) => {
  const maxNeighborRadius = 14;
  const minPadding = minDistance + Math.max(2, minDistance * 0.38);
  const searchRange = clampInt(
    Math.ceil((radius + maxNeighborRadius + minPadding) / grid.cellSize),
    1,
    4
  );
  const cellX = Math.floor(x / grid.cellSize);
  const cellY = Math.floor(y / grid.cellSize);

  for (let offsetX = -searchRange; offsetX <= searchRange; offsetX += 1) {
    for (let offsetY = -searchRange; offsetY <= searchRange; offsetY += 1) {
      const key = `${cellX + offsetX}:${cellY + offsetY}`;
      const nodes = grid.cells.get(key);
      if (!nodes) continue;
      for (const other of nodes) {
        const required = radius + other.radius + minPadding;
        const dx = other.x - x;
        const dy = other.y - y;
        if (dx * dx + dy * dy < required * required) {
          return true;
        }
      }
    }
  }
  return false;
};

type DirectionalCandidate = {
  score: number;
  parentSiteId: string | null;
};

const pickDirectionalCandidates = ({
  index,
  state,
  direction,
  panX,
  panY,
  viewportWidth,
  viewportHeight,
  batchSize,
  randomUnitValues,
  randomCursor
}: {
  index: ExplorerGraphIndex;
  state: ExplorerLoadedGraphState;
  direction: { x: number; y: number };
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
  batchSize: number;
  randomUnitValues: number[];
  randomCursor: number;
}) => {
  const loadedSet = new Set(state.loadedSiteIds);
  const normalizedDirection = normalizeDirection(direction);
  const rect = getViewportRect({
    panX,
    panY,
    viewportWidth,
    viewportHeight
  });
  const dominantX = Math.abs(normalizedDirection.x) >= Math.abs(normalizedDirection.y);
  const threshold = 120;

  const frontier: string[] = [];
  state.loadedSiteIds.forEach((siteId) => {
    const node = state.nodesById[siteId];
    if (!node) return;
    let isNearEdge = false;
    if (dominantX) {
      if (normalizedDirection.x >= 0) {
        isNearEdge = node.x >= rect.right - threshold;
      } else {
        isNearEdge = node.x <= rect.left + threshold;
      }
    } else if (normalizedDirection.y >= 0) {
      isNearEdge = node.y >= rect.bottom - threshold;
    } else {
      isNearEdge = node.y <= rect.top + threshold;
    }
    if (isNearEdge) frontier.push(siteId);
  });

  const candidateBySiteId: Record<string, DirectionalCandidate> = {};
  const upsertCandidate = (siteId: string, score: number, parentSiteId: string | null) => {
    if (loadedSet.has(siteId)) return;
    const current = candidateBySiteId[siteId];
    if (!current) {
      candidateBySiteId[siteId] = {
        score,
        parentSiteId
      };
      return;
    }
    current.score += score;
    if (parentSiteId && !current.parentSiteId) {
      current.parentSiteId = parentSiteId;
    }
  };

  frontier.forEach((frontierSiteId) => {
    const neighbors = index.adjacencyBySiteId[frontierSiteId] ?? [];
    neighbors.forEach((neighborId) => {
      upsertCandidate(neighborId, 120, frontierSiteId);
    });
  });

  state.loadedSiteIds.forEach((siteId) => {
    const neighbors = index.adjacencyBySiteId[siteId] ?? [];
    neighbors.forEach((neighborId) => {
      upsertCandidate(neighborId, 26, siteId);
    });
  });

  const candidateEntries = Object.entries(candidateBySiteId).sort((left, right) => {
    if (left[1].score !== right[1].score) return right[1].score - left[1].score;
    return left[0].localeCompare(right[0]);
  });
  const pickedSiteIds = candidateEntries.slice(0, batchSize).map(([siteId]) => siteId);
  const pickedSet = new Set(pickedSiteIds);
  let cursor = randomCursor;
  if (pickedSiteIds.length < batchSize) {
    let randomAdded = 0;
    const randomFillBudget = clampInt(Math.ceil(batchSize * 0.35), 2, batchSize);
    const remainingPool = index.siteIds.filter(
      (siteId) => !loadedSet.has(siteId) && !pickedSet.has(siteId)
    );
    while (
      pickedSiteIds.length < batchSize &&
      remainingPool.length &&
      randomAdded < randomFillBudget
    ) {
      const random = getUnitRandom(randomUnitValues, cursor);
      cursor = random.nextCursor;
      const poolIndex = clampInt(random.value * (remainingPool.length - 1), 0, remainingPool.length - 1);
      const [picked] = remainingPool.splice(poolIndex, 1);
      if (!picked) continue;
      pickedSiteIds.push(picked);
      pickedSet.add(picked);
      upsertCandidate(picked, 1, null);
      randomAdded += 1;
    }
  }

  const parentBySiteId: Record<string, string | null> = {};
  pickedSiteIds.forEach((siteId) => {
    parentBySiteId[siteId] = candidateBySiteId[siteId]?.parentSiteId ?? null;
  });

  return {
    pickedSiteIds,
    parentBySiteId,
    randomCursor: cursor
  };
};

export const expandLoadedGraphState = ({
  index,
  state,
  direction,
  panX,
  panY,
  viewportWidth,
  viewportHeight,
  worldWidth,
  worldHeight,
  minDistance,
  batchSize,
  randomUnitValues
}: {
  index: ExplorerGraphIndex;
  state: ExplorerLoadedGraphState;
  direction: { x: number; y: number };
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  minDistance: number;
  batchSize: number;
  randomUnitValues: number[];
}): ExplorerLoadedGraphState => {
  if (!index.siteIds.length) return state;
  if (state.loadedSiteIds.length >= index.siteIds.length) return state;

  const normalizedDirection = normalizeDirection(direction);
  if (Math.abs(normalizedDirection.x) + Math.abs(normalizedDirection.y) < 0.001) {
    return state;
  }

  const pick = pickDirectionalCandidates({
    index,
    state,
    direction: normalizedDirection,
    panX,
    panY,
    viewportWidth,
    viewportHeight,
    batchSize,
    randomUnitValues,
    randomCursor: state.randomCursor
  });
  if (!pick.pickedSiteIds.length) {
    return state;
  }

  const nextNodesById: Record<string, ExplorerGraphNode> = { ...state.nodesById };
  const nextLoadedSiteIds = [...state.loadedSiteIds];
  const loadedSet = new Set(nextLoadedSiteIds);
  let cursor = pick.randomCursor;
  const rect = getViewportRect({
    panX,
    panY,
    viewportWidth,
    viewportHeight
  });
  const perpendicular = {
    x: -normalizedDirection.y,
    y: normalizedDirection.x
  };
  const placementGrid = buildPlacementGrid({
    nodesById: nextNodesById,
    loadedSiteIds: nextLoadedSiteIds,
    cellSize: Math.max(24, minDistance * 1.95)
  });
  const insertionAttempts = 18;

  pick.pickedSiteIds.forEach((siteId) => {
    if (loadedSet.has(siteId)) return;
    const site = index.sitesById[siteId];
    if (!site) return;
    const parentSiteId = pick.parentBySiteId[siteId];
    const parentNode = parentSiteId ? nextNodesById[parentSiteId] : null;

    const anchorX = parentNode
      ? parentNode.x
      : rect.centerX + normalizedDirection.x * Math.min(viewportWidth, viewportHeight) * 0.42;
    const anchorY = parentNode
      ? parentNode.y
      : rect.centerY + normalizedDirection.y * Math.min(viewportWidth, viewportHeight) * 0.42;
    const degree = index.degreeBySiteId[siteId] ?? 0;
    const radius = getNodeRadius(degree);

    let x = clamp(anchorX, 8, worldWidth - 8);
    let y = clamp(anchorY, 8, worldHeight - 8);
    let placedWithSpacing = false;

    for (let attempt = 0; attempt < insertionAttempts; attempt += 1) {
      const randomA = getUnitRandom(randomUnitValues, cursor);
      cursor = randomA.nextCursor;
      const randomB = getUnitRandom(randomUnitValues, cursor);
      cursor = randomB.nextCursor;
      const randomC = getUnitRandom(randomUnitValues, cursor);
      cursor = randomC.nextCursor;
      const randomD = getUnitRandom(randomUnitValues, cursor);
      cursor = randomD.nextCursor;

      const rotation = (randomC.value - 0.5) * Math.min(Math.PI * 0.95, 0.24 + attempt * 0.17);
      const cosRotation = Math.cos(rotation);
      const sinRotation = Math.sin(rotation);
      const directionX = normalizedDirection.x * cosRotation - normalizedDirection.y * sinRotation;
      const directionY = normalizedDirection.x * sinRotation + normalizedDirection.y * cosRotation;
      const spawnDistance = minDistance * (1.35 + randomA.value * 2.1 + attempt * 0.24);
      const jitterDistance = (randomB.value - 0.5) * minDistance * (3.1 + attempt * 0.43);
      const driftDistance = (randomD.value - 0.5) * minDistance * (1.2 + attempt * 0.28);

      const candidateX = clamp(
        anchorX +
          directionX * spawnDistance +
          perpendicular.x * jitterDistance +
          normalizedDirection.x * driftDistance,
        8,
        worldWidth - 8
      );
      const candidateY = clamp(
        anchorY +
          directionY * spawnDistance +
          perpendicular.y * jitterDistance +
          normalizedDirection.y * driftDistance,
        8,
        worldHeight - 8
      );
      x = candidateX;
      y = candidateY;
      if (
        !hasPlacementConflict({
          grid: placementGrid,
          x,
          y,
          radius,
          minDistance
        })
      ) {
        placedWithSpacing = true;
        break;
      }
    }

    if (!placedWithSpacing) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const randomX = getUnitRandom(randomUnitValues, cursor);
        cursor = randomX.nextCursor;
        const randomY = getUnitRandom(randomUnitValues, cursor);
        cursor = randomY.nextCursor;
        const candidateX = clamp(8 + randomX.value * (worldWidth - 16), 8, worldWidth - 8);
        const candidateY = clamp(8 + randomY.value * (worldHeight - 16), 8, worldHeight - 8);
        x = candidateX;
        y = candidateY;
        if (
          !hasPlacementConflict({
            grid: placementGrid,
            x,
            y,
            radius,
            minDistance
          })
        ) {
          break;
        }
      }
    }

    const node = makeNode({
      site,
      degree,
      x,
      y
    });
    nextNodesById[siteId] = node;
    addNodeToPlacementGrid(placementGrid, node);
    nextLoadedSiteIds.push(siteId);
    loadedSet.add(siteId);
  });

  relaxLoadedGraph({
    nodesById: nextNodesById,
    loadedSiteIds: nextLoadedSiteIds,
    adjacencyBySiteId: index.adjacencyBySiteId,
    worldWidth,
    worldHeight,
    minDistance,
    iterations: clampInt(22 + Math.sqrt(Math.max(1, pick.pickedSiteIds.length)) * 2.2, 24, 48)
  });

  return {
    nodesById: nextNodesById,
    loadedSiteIds: nextLoadedSiteIds,
    randomCursor: cursor
  };
};

export const buildExplorerGraphFromLoaded = ({
  index,
  state
}: {
  index: ExplorerGraphIndex;
  state: ExplorerLoadedGraphState | null;
}): ExplorerGraph => {
  if (!state || !state.loadedSiteIds.length) {
    return {
      nodes: [],
      edges: [],
      degreeBySiteId: index.degreeBySiteId
    };
  }

  const loadedSet = new Set(state.loadedSiteIds);
  const nodes = state.loadedSiteIds
    .map((siteId) => state.nodesById[siteId])
    .filter((node): node is ExplorerGraphNode => Boolean(node));

  const edges: ExplorerGraphEdge[] = [];
  state.loadedSiteIds.forEach((siteId) => {
    const sourceNode = state.nodesById[siteId];
    if (!sourceNode) return;
    const neighbors = index.adjacencyBySiteId[siteId] ?? [];
    neighbors.forEach((neighborId) => {
      if (siteId >= neighborId) return;
      if (!loadedSet.has(neighborId)) return;
      const targetNode = state.nodesById[neighborId];
      if (!targetNode) return;
      const left = sourceNode.siteId < targetNode.siteId ? sourceNode.siteId : targetNode.siteId;
      const right = sourceNode.siteId < targetNode.siteId ? targetNode.siteId : sourceNode.siteId;
      edges.push({
        key: `${left}:${right}`,
        sourceSiteId: sourceNode.siteId,
        targetSiteId: targetNode.siteId,
        sourceX: sourceNode.x,
        sourceY: sourceNode.y,
        targetX: targetNode.x,
        targetY: targetNode.y
      });
    });
  });

  return {
    nodes,
    edges,
    degreeBySiteId: index.degreeBySiteId
  };
};
