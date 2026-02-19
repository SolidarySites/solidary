import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  AstroTemplatePreviewHandle,
  PreviewSelectedImage
} from "../components/AstroTemplatePreview";
import {
  getImageExtension,
  MAX_IMAGE_UPLOAD_BYTES,
  SITE_DRAFT_IMAGES_BUCKET,
  SOLIDARY_MEDIA_UPLOADS_BASE_PATH
} from "../services/draft-utils";
import type { DraftImageAsset, DraftState } from "../services/types";
import { supabase } from "../../../lib/supabase";
import { slugify } from "../../../lib/slugify";
import type { NoticeKind } from "../../../types/notice";

type UseBuilderPreviewEditorParams = {
  canEditPageContent: boolean;
  session: Session | null;
  draftState: DraftState | null;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
};

export const useBuilderPreviewEditor = ({
  canEditPageContent,
  session,
  draftState,
  setNotice,
  setNoticeKind,
  setDraftImages
}: UseBuilderPreviewEditorParams) => {
  const [selectedEditorImage, setSelectedEditorImage] = useState<PreviewSelectedImage | null>(null);
  const [uploadingInlineImage, setUploadingInlineImage] = useState(false);
  const previewRef = useRef<AstroTemplatePreviewHandle | null>(null);

  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const runPreviewCommand = (command: string, value?: string) => {
    if (!canEditPageContent) return;
    previewRef.current?.execCommand(command, value);
  };

  const runPreviewLink = () => {
    if (!canEditPageContent) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    previewRef.current?.execCommand("createLink", url);
  };

  const capturePreviewSelection = () => {
    previewRef.current?.captureSelection();
  };

  const handleSelectedEditorImageAltChange = (value: string) => {
    setSelectedEditorImage((current) => (current ? { ...current, alt: value } : current));
    previewRef.current?.updateSelectedImageAlt(value);
  };

  const handleSelectedEditorImageCaptionChange = (value: string) => {
    setSelectedEditorImage((current) => (current ? { ...current, caption: value } : current));
    previewRef.current?.updateSelectedImageCaption(value);
  };

  const handleSelectedEditorImageSizeChange = (value: number) => {
    const clamped = Math.min(100, Math.max(1, Number.isNaN(value) ? 100 : Math.round(value)));
    setSelectedEditorImage((current) =>
      current ? { ...current, sizePercent: clamped } : current
    );
    previewRef.current?.updateSelectedImageSize(clamped);
  };

  const clearSelectedEditorImage = () => {
    setSelectedEditorImage(null);
  };

  const handleInlineImageUpload = async (file: File): Promise<void> => {
    resetNotices();

    if (!canEditPageContent) {
      const message = "Open Pages and make sure the section lock is available to edit content.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!file.type.startsWith("image/")) {
      const message = "Select an image file to insert.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      const message = "Image is too large. Max upload size is 5 MB.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!session) {
      const message = "Sign in with GitHub to upload images.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    if (!draftState) {
      const message = "Create or load a draft before uploading images.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    }

    const fileBaseName = slugify(file.name.replace(/\.[^/.]+$/, "")) || "image";
    const fileExtension = getImageExtension(file);
    const filename = `${Date.now()}-${fileBaseName}-${crypto.randomUUID().slice(0, 8)}.${fileExtension}`;
    const storagePath = `drafts/${draftState.id}/${filename}`;
    const sitePath = `${SOLIDARY_MEDIA_UPLOADS_BASE_PATH}/${filename}`;

    try {
      setUploadingInlineImage(true);
      const { error: uploadError } = await supabase.storage
        .from(SITE_DRAFT_IMAGES_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from(SITE_DRAFT_IMAGES_BUCKET)
        .getPublicUrl(storagePath);

      const imageUrl = publicUrlData.publicUrl?.trim();
      if (!imageUrl) {
        throw new Error("Failed to generate a public image URL.");
      }

      const { error: metadataError } = await supabase.from("site_draft_images").insert({
        draft_id: draftState.id,
        storage_path: storagePath,
        public_url: imageUrl,
        site_path: sitePath
      });
      if (metadataError) {
        await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET).remove([storagePath]);
        throw new Error(metadataError.message);
      }

      setDraftImages((items) => [
        ...items,
        {
          storagePath,
          publicUrl: imageUrl,
          sitePath,
          uploadedAt: new Date().toISOString()
        }
      ]);
      previewRef.current?.execCommand("insertImage", imageUrl);
      setNotice("Image uploaded and inserted.");
      setNoticeKind("notice");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to upload image.";
      setNotice(message);
      setNoticeKind("error");
      throw new Error(message);
    } finally {
      setUploadingInlineImage(false);
    }
  };

  return {
    previewRef,
    selectedEditorImage,
    setSelectedEditorImage,
    clearSelectedEditorImage,
    uploadingInlineImage,
    runPreviewCommand,
    runPreviewLink,
    capturePreviewSelection,
    handleSelectedEditorImageAltChange,
    handleSelectedEditorImageCaptionChange,
    handleSelectedEditorImageSizeChange,
    handleInlineImageUpload
  };
};
