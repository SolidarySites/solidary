const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clampInt = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

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

export const getUnitRandom = (randomUnitValues: number[], cursor: number) => {
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
