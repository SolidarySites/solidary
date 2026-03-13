export type ImageElementLoadState = "pending" | "loaded" | "error";

type ImageElementLike =
  | Pick<HTMLImageElement, "complete" | "naturalWidth" | "naturalHeight">
  | null
  | undefined;

export const getImageElementLoadState = (
  image: ImageElementLike
): ImageElementLoadState => {
  if (!image || !image.complete) {
    return "pending";
  }

  return image.naturalWidth > 0 && image.naturalHeight > 0 ? "loaded" : "error";
};
