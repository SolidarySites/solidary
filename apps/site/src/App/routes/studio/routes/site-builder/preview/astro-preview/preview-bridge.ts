export const PREVIEW_BRIDGE_CHANNEL = "solidary:builder-preview";
export const PREVIEW_IMAGE_ASPECT_RATIO_ATTR = "data-builder-image-aspect-ratio";

export type PreviewBridgeMessage = {
  channel: string;
  type: string;
  token?: string;
  payload?: unknown;
};

export type PreviewCommandPayload =
  | {
      kind: "execCommand";
      command: string;
      value?: string;
    }
  | {
      kind: "focusEditor";
    }
  | {
      kind: "captureSelection";
    }
  | {
      kind: "replaceImageSource";
      previousSrc: string;
      nextSrc: string | null;
      aspectRatioOverride?: number;
    }
  | {
      kind: "setImageAspectRatioBySource";
      source: string;
      aspectRatio: number;
    }
  | {
      kind: "updateSelectedImageAlt";
      value: string;
    }
  | {
      kind: "updateSelectedImageCaption";
      value: string;
    }
  | {
      kind: "updateSelectedImageSize";
      value: number;
    }
  | {
      kind: "updateSelectedElementClassName";
      value: string;
      elementId?: string;
    }
  | {
      kind: "updateSelectedElementInlineStyle";
      value: string;
      elementId?: string;
    }
  | {
      kind: "clearSelectedImage";
    };
