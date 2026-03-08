import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseSiteImagePreviewEffectOptions = {
  siteImage: File | null;
  setSiteImagePreview: Dispatch<SetStateAction<string | null>>;
};

export const useSiteImagePreviewEffect = ({
  siteImage,
  setSiteImagePreview
}: UseSiteImagePreviewEffectOptions) => {
  useEffect(() => {
    if (!siteImage) {
      setSiteImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(siteImage);
    setSiteImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [setSiteImagePreview, siteImage]);
};
