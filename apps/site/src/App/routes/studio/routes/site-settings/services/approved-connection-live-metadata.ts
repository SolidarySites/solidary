import { parseSolidaryLinksJson } from "../../../../../features/site-draft/services/solidary-links";
import { readTextFile } from "../../../../../services/github";
import { FILE_KEYS } from "../../site-builder/services/constants";
import type { SiteConnectionRequest } from "./site-connections";

export type ApprovedConnectionCounterparty = {
  siteId: string;
  siteTitle: string;
  currentCanonicalUrl: string;
};

export type ApprovedConnectionLiveMetadata = {
  requestId: string;
  connectedSiteId: string;
  connectedSiteTitle: string;
  currentCanonicalUrl: string;
  liveRepoUrl: string | null;
  isLiveMetadataStale: boolean;
};

const normalizeUrl = (value: string) => value.trim().replace(/\/+$/, "");

const resolveRepoCoordinates = (repoFullName: string) => {
  const [owner, repo] = repoFullName.trim().split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository name. Please reload and try again.");
  }
  return { owner, repo };
};

export const getApprovedConnectionCounterparty = (
  request: SiteConnectionRequest
): ApprovedConnectionCounterparty => ({
  siteId: request.isIncoming ? request.sourceSiteId : request.targetSiteId,
  siteTitle: request.isIncoming ? request.sourceSiteTitle : request.targetSiteTitle,
  currentCanonicalUrl: normalizeUrl(request.isIncoming ? request.sourceSiteUrl : request.targetSiteUrl)
});

export const loadLiveSolidaryLinksRaw = async ({
  repoFullName,
  branch
}: {
  repoFullName: string;
  branch: string;
}) => {
  const { owner, repo } = resolveRepoCoordinates(repoFullName);
  const raw = await readTextFile("", owner, repo, FILE_KEYS.solidaryLinks, branch, true);
  return raw ?? "";
};

export const compareApprovedConnectionsAgainstLiveMetadata = ({
  approvedRequests,
  liveSolidaryLinksRaw
}: {
  approvedRequests: SiteConnectionRequest[];
  liveSolidaryLinksRaw: string;
}): ApprovedConnectionLiveMetadata[] => {
  const liveDocument = parseSolidaryLinksJson(liveSolidaryLinksRaw);
  const liveUrlBySiteId = new Map(
    (liveDocument?.connections ?? []).map((connection) => [
      connection.connected_site.site_id,
      normalizeUrl(connection.connected_site["@id"])
    ])
  );

  return approvedRequests.map((request) => {
    const counterparty = getApprovedConnectionCounterparty(request);
    const liveRepoUrl = liveUrlBySiteId.get(counterparty.siteId) ?? null;
    const currentCanonicalUrl = normalizeUrl(counterparty.currentCanonicalUrl);
    const isLiveMetadataStale =
      currentCanonicalUrl.length > 0 && (!liveRepoUrl || liveRepoUrl !== currentCanonicalUrl);

    return {
      requestId: request.requestId,
      connectedSiteId: counterparty.siteId,
      connectedSiteTitle: counterparty.siteTitle,
      currentCanonicalUrl,
      liveRepoUrl,
      isLiveMetadataStale
    };
  });
};

export const hasApprovedConnectionLiveMetadataDrift = (
  entries: ApprovedConnectionLiveMetadata[]
) => entries.some((entry) => entry.isLiveMetadataStale);
