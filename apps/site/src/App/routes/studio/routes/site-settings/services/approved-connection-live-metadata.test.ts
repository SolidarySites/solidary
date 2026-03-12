import { describe, expect, it } from "vitest";
import {
  compareApprovedConnectionsAgainstLiveMetadata,
  getApprovedConnectionCounterparty,
  hasApprovedConnectionLiveMetadataDrift
} from "./approved-connection-live-metadata";
import type { SiteConnectionRequest } from "./site-connections";

const createApprovedRequest = (
  overrides: Partial<SiteConnectionRequest> = {}
): SiteConnectionRequest => ({
  requestId: "request-1",
  connectionUuid: "connection-1",
  status: "approved",
  createdAt: "2026-03-12T10:00:00Z",
  respondedAt: "2026-03-12T11:00:00Z",
  sourceSiteId: "site-source",
  sourceSiteTitle: "Source Site",
  sourceSiteUrl: "https://source.example.com",
  sourceSiteImageUrl: "/solidary-media/images/site-image_thumb.jpg",
  sourceOwnerDisplayName: "Source Owner",
  targetSiteId: "site-target",
  targetSiteTitle: "Target Site",
  targetSiteUrl: "https://target.example.com",
  targetSiteImageUrl: "/solidary-media/images/site-image_thumb.jpg",
  targetOwnerDisplayName: "Target Owner",
  isIncoming: false,
  ...overrides
});

describe("approved connection live metadata", () => {
  it("compares approved connections against the live repo manifest", () => {
    const approvedRequests = [
      createApprovedRequest({
        requestId: "request-1",
        targetSiteId: "site-2",
        targetSiteTitle: "Red Rose",
        targetSiteUrl: "https://red-rose-on-green-background.netlify.app"
      })
    ];

    const result = compareApprovedConnectionsAgainstLiveMetadata({
      approvedRequests,
      liveSolidaryLinksRaw: `{
  "@id": "https://theatrebuilding.github.io/test",
  "site_id": "site-1",
  "connections": [
    {
      "@id": "urn:uuid:connection-1",
      "@type": "connection",
      "connected_site": {
        "@id": "https://jazbogross.github.io/site",
        "@type": "site",
        "site_id": "site-2"
      }
    }
  ]
}`
    });

    expect(result).toEqual([
      {
        requestId: "request-1",
        connectedSiteId: "site-2",
        connectedSiteTitle: "Red Rose",
        currentCanonicalUrl: "https://red-rose-on-green-background.netlify.app",
        liveRepoUrl: "https://jazbogross.github.io/site",
        isLiveMetadataStale: true
      }
    ]);
    expect(hasApprovedConnectionLiveMetadataDrift(result)).toBe(true);
  });

  it("treats matching URLs as up to date after normalizing trailing slashes", () => {
    const approvedRequests = [
      createApprovedRequest({
        requestId: "request-2",
        targetSiteId: "site-2",
        targetSiteTitle: "Red Rose",
        targetSiteUrl: "https://red-rose-on-green-background.netlify.app/"
      })
    ];

    const result = compareApprovedConnectionsAgainstLiveMetadata({
      approvedRequests,
      liveSolidaryLinksRaw: `{
  "@id": "https://theatrebuilding.github.io/test",
  "site_id": "site-1",
  "connections": [
    {
      "@id": "urn:uuid:connection-2",
      "@type": "connection",
      "connected_site": {
        "@id": "https://red-rose-on-green-background.netlify.app",
        "@type": "site",
        "site_id": "site-2"
      }
    }
  ]
}`
    });

    expect(result[0]?.isLiveMetadataStale).toBe(false);
    expect(hasApprovedConnectionLiveMetadataDrift(result)).toBe(false);
  });

  it("marks approved connections stale when the live repo entry is missing", () => {
    const approvedRequests = [
      createApprovedRequest({
        requestId: "request-3",
        isIncoming: true,
        sourceSiteId: "site-3",
        sourceSiteTitle: "Blue Garden",
        sourceSiteUrl: "https://blue-garden.netlify.app"
      })
    ];

    const result = compareApprovedConnectionsAgainstLiveMetadata({
      approvedRequests,
      liveSolidaryLinksRaw: `{
  "@id": "https://theatrebuilding.github.io/test",
  "site_id": "site-1",
  "connections": []
}`
    });

    expect(result).toEqual([
      {
        requestId: "request-3",
        connectedSiteId: "site-3",
        connectedSiteTitle: "Blue Garden",
        currentCanonicalUrl: "https://blue-garden.netlify.app",
        liveRepoUrl: null,
        isLiveMetadataStale: true
      }
    ]);
  });

  it("returns the other site for approved incoming and outgoing connections", () => {
    expect(
      getApprovedConnectionCounterparty(
        createApprovedRequest({
          isIncoming: false,
          targetSiteId: "target-1",
          targetSiteTitle: "Outgoing Target",
          targetSiteUrl: "https://outgoing.example.com"
        })
      )
    ).toEqual({
      siteId: "target-1",
      siteTitle: "Outgoing Target",
      currentCanonicalUrl: "https://outgoing.example.com"
    });

    expect(
      getApprovedConnectionCounterparty(
        createApprovedRequest({
          isIncoming: true,
          sourceSiteId: "source-1",
          sourceSiteTitle: "Incoming Source",
          sourceSiteUrl: "https://incoming.example.com"
        })
      )
    ).toEqual({
      siteId: "source-1",
      siteTitle: "Incoming Source",
      currentCanonicalUrl: "https://incoming.example.com"
    });
  });
});
