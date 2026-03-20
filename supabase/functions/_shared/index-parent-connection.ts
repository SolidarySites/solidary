const normalizeHexSeed = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-f0-9]/g, "");

const formatUuid = (raw: string) =>
  [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20, 32),
  ].join("-");

export const buildIndexParentConnectionUuid = ({
  sourceIndexId,
  targetIndexId,
}: {
  sourceIndexId: string;
  targetIndexId: string;
}) => {
  const normalizedSource = normalizeHexSeed(sourceIndexId);
  const normalizedTarget = normalizeHexSeed(targetIndexId);
  if (!normalizedSource || !normalizedTarget) {
    return "";
  }

  const seed = `${normalizedSource}${normalizedTarget}${normalizedSource}${
    normalizedTarget
  }`
    .padEnd(32, "0")
    .slice(0, 32)
    .split("");

  seed[12] = "4";
  const variantNibble = Number.parseInt(seed[16] ?? "0", 16);
  seed[16] = ((Number.isNaN(variantNibble) ? 0 : variantNibble) & 0x3 | 0x8)
    .toString(16);

  return formatUuid(seed.join(""));
};
