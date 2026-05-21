import type { ExplorerSite } from "./explorer-data";
import type {
  ExplorerGraph,
  ExplorerGraphEdge,
  ExplorerGraphIndex,
  ExplorerGraphNode,
  ExplorerLoadedGraphState
} from "./explorer-graph";
import { getUnitRandom } from "./explorer-graph-random";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clampInt = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

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
      x: clamp(8 + randomX.value * (worldWidth - 16), 8, worldWidth - 8),
      y: clamp(8 + randomY.value * (worldHeight - 16), 8, worldHeight - 8)
    });
  });

  const loadedSiteIds = Object.keys(nodesById);
  relaxLoadedGraph({
    nodesById,
    loadedSiteIds,
    adjacencyBySiteId: index.adjacencyBySiteId,
    worldWidth,
    worldHeight,
    minDistance,
    iterations: clampInt(36 + Math.sqrt(Math.max(1, loadedSiteIds.length)) * 3.2, 36, 72)
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
}) => ({
  left: panX,
  top: panY,
  right: panX + viewportWidth,
  bottom: panY + viewportHeight,
  centerX: panX + viewportWidth / 2,
  centerY: panY + viewportHeight / 2
});

const normalizeDirection = (direction: { x: number; y: number }) => {
  const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  if (magnitude <= 0.0001) {
    return {
      x: 0,
      y: 0
    };
  }
  return {
    x: direction.x / magnitude,
    y: direction.y / magnitude
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
  const existing = grid.cells.get(key);
  if (existing) {
    existing.push(node);
    return;
  }
  grid.cells.set(key, [node]);
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
  const baseCellX = Math.floor(x / grid.cellSize);
  const baseCellY = Math.floor(y / grid.cellSize);
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const candidates = grid.cells.get(`${baseCellX + offsetX}:${baseCellY + offsetY}`);
      if (!candidates) continue;
      for (const candidate of candidates) {
        const dx = candidate.x - x;
        const dy = candidate.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < candidate.radius + radius + minDistance) {
          return true;
        }
      }
    }
  }
  return false;
};

type DirectionalCandidate = {
  siteId: string;
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
  const rect = getViewportRect({
    panX,
    panY,
    viewportWidth,
    viewportHeight
  });
  const loadedSet = new Set(state.loadedSiteIds);
  const candidates: DirectionalCandidate[] = [];

  state.loadedSiteIds.forEach((siteId) => {
    const neighbors = index.adjacencyBySiteId[siteId] ?? [];
    neighbors.forEach((neighborId) => {
      if (loadedSet.has(neighborId)) return;
      const node = state.nodesById[siteId];
      if (!node) return;
      const dx = node.x - rect.centerX;
      const dy = node.y - rect.centerY;
      const projection = dx * direction.x + dy * direction.y;
      const degree = index.degreeBySiteId[neighborId] ?? 0;
      candidates.push({
        siteId: neighborId,
        parentSiteId: siteId,
        score: projection + degree * 28
      });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  const candidateBySiteId: Record<string, DirectionalCandidate> = {};
  candidates.forEach((candidate) => {
    const existing = candidateBySiteId[candidate.siteId];
    if (!existing || candidate.score > existing.score) {
      candidateBySiteId[candidate.siteId] = candidate;
    }
  });

  const uniqueCandidates = Object.values(candidateBySiteId);
  let cursor = randomCursor;
  const pickedSiteIds: string[] = [];
  while (pickedSiteIds.length < batchSize && uniqueCandidates.length) {
    const nextRandom = getUnitRandom(randomUnitValues, cursor);
    cursor = nextRandom.nextCursor;
    const indexPosition = clampInt(
      nextRandom.value * Math.min(uniqueCandidates.length - 1, Math.max(0, batchSize * 2)),
      0,
      uniqueCandidates.length - 1
    );
    const [picked] = uniqueCandidates.splice(indexPosition, 1);
    if (picked) {
      pickedSiteIds.push(picked.siteId);
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
        sourceId: sourceNode.siteId,
        targetId: targetNode.siteId,
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
