import { useCallback, useEffect, useRef } from "react";
import { githubRequest } from "../../../studio/github";
import type { GitHubPublishStatusResponse, PublishFeedback } from "./types";
import { getPublishPollDelayMs } from "./utils";

type StartPublishTrackingParams = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  headSha?: string;
  publishStartedAt: string;
};

type UsePublishStatusTrackingParams = {
  onPublishFeedback: (feedback: PublishFeedback | null) => void;
  onPublishError: (message: string) => void;
  onPublishSuccess: (message: string) => void;
};

export const usePublishStatusTracking = ({
  onPublishFeedback,
  onPublishError,
  onPublishSuccess
}: UsePublishStatusTrackingParams) => {
  const publishPollTimeoutRef = useRef<number | null>(null);
  const publishPollTokenRef = useRef(0);

  const clearPublishPollTimeout = useCallback(() => {
    if (publishPollTimeoutRef.current === null) return;
    window.clearTimeout(publishPollTimeoutRef.current);
    publishPollTimeoutRef.current = null;
  }, []);

  const cancelPublishStatusTracking = useCallback(() => {
    publishPollTokenRef.current += 1;
    clearPublishPollTimeout();
  }, [clearPublishPollTimeout]);

  useEffect(() => cancelPublishStatusTracking, [cancelPublishStatusTracking]);

  const startPublishStatusTracking = useCallback(
    ({ token, owner, repo, branch, headSha, publishStartedAt }: StartPublishTrackingParams) => {
      publishPollTokenRef.current += 1;
      const pollToken = publishPollTokenRef.current;
      clearPublishPollTimeout();

      const actionsUrl = `https://github.com/${owner}/${repo}/actions/workflows/deploy.yml`;
      onPublishFeedback({
        kind: "progress",
        text: "GitHub is building your page.",
        runUrl: actionsUrl
      });
      let latestRunUrl: string | undefined;
      let latestPagesUrl: string | undefined;

      const poll = async (attempt: number) => {
        if (publishPollTokenRef.current !== pollToken) return;

        let status: GitHubPublishStatusResponse;
        try {
          status = await githubRequest<GitHubPublishStatusResponse>(
            "/.netlify/functions/github-publish-status",
            {
              token,
              owner,
              repo,
              branch,
              headSha,
              publishStartedAt,
              workflow: "deploy.yml"
            }
          );
        } catch (error) {
          if (publishPollTokenRef.current !== pollToken) return;
          const delay = getPublishPollDelayMs(attempt + 1);
          if (delay === null) {
            const fallbackMessage =
              error instanceof Error
                ? `${error.message} Open GitHub Actions to confirm deployment.`
                : "Unable to confirm deployment status. Open GitHub Actions for details.";
            onPublishFeedback({
              kind: "error",
              text: fallbackMessage,
              runUrl: latestRunUrl ?? actionsUrl,
              pagesUrl: latestPagesUrl
            });
            onPublishError(fallbackMessage);
            clearPublishPollTimeout();
            return;
          }
          publishPollTimeoutRef.current = window.setTimeout(() => {
            void poll(attempt + 1);
          }, delay);
          return;
        }

        if (publishPollTokenRef.current !== pollToken) return;

        const runUrl = status.runUrl?.trim() || undefined;
        const pagesUrl = status.pagesUrl?.trim() || undefined;
        if (runUrl) latestRunUrl = runUrl;
        if (pagesUrl) latestPagesUrl = pagesUrl;

        if (status.phase === "failed") {
          const message = status.message?.trim() || "GitHub Actions deployment failed.";
          onPublishFeedback({
            kind: "error",
            text: message,
            runUrl: latestRunUrl ?? actionsUrl,
            pagesUrl: latestPagesUrl
          });
          onPublishError(message);
          clearPublishPollTimeout();
          return;
        }

        if (status.phase === "deployed") {
          const message = "Site is live.";
          onPublishFeedback({
            kind: "success",
            text: message,
            runUrl: latestRunUrl ?? actionsUrl,
            pagesUrl: latestPagesUrl
          });
          onPublishSuccess(message);
          clearPublishPollTimeout();
          return;
        }

        onPublishFeedback({
          kind: "progress",
          text: "GitHub is building your page.",
          runUrl: actionsUrl,
          pagesUrl: latestPagesUrl
        });

        const delay = getPublishPollDelayMs(attempt + 1);
        if (delay === null) {
          const timeoutMessage = "Could not confirm deployment completion yet. Open GitHub Actions.";
          onPublishFeedback({
            kind: "error",
            text: timeoutMessage,
            runUrl: latestRunUrl ?? actionsUrl,
            pagesUrl: latestPagesUrl
          });
          onPublishError(timeoutMessage);
          clearPublishPollTimeout();
          return;
        }

        publishPollTimeoutRef.current = window.setTimeout(() => {
          void poll(attempt + 1);
        }, delay);
      };

      void poll(0);
    },
    [clearPublishPollTimeout, onPublishError, onPublishFeedback, onPublishSuccess]
  );

  return {
    startPublishStatusTracking,
    cancelPublishStatusTracking
  };
};
