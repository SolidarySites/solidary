import { supabase } from "../../../lib/supabase";
import { PROFILE_AVATAR_BUCKET } from "../../../features/auth/services/user-profile";
import { processImageVariantsFromOriginal } from "../../../services/image-processing/picsquish";

export const MAX_PROFILE_AVATAR_FILE_BYTES = 1 * 1024 * 1024;

const AVATAR_TARGET_BYTES = 140 * 1024;
const AVATAR_MAX_DIMENSION = 360;
const AVATAR_VARIANTS = [
  {
    key: "avatar",
    label: "Avatar image",
    maxBytes: AVATAR_TARGET_BYTES,
    maxDimensionLimit: AVATAR_MAX_DIMENSION
  }
] as const;

const compressAvatarFile = async (file: File): Promise<Blob> => {
  try {
    const variants = await processImageVariantsFromOriginal({
      sourceImage: file,
      variants: AVATAR_VARIANTS,
      jpegQuality: 0.9,
      jpegDpi: 72,
      minDimensionLimit: 64,
      maxDimensionAttempts: 24
    });
    return variants.avatar;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message) {
      throw new Error(message);
    }
    throw new Error("Could not process avatar image.");
  }
};

const getAvatarFilename = () =>
  `avatar-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;

export const isUserOwnedProfileAvatarPath = (
  path: string,
  userId: string
): boolean => {
  const normalizedPath = path.trim();
  const normalizedUserId = userId.trim();
  if (!normalizedPath || !normalizedUserId) {
    return false;
  }

  return normalizedPath.startsWith(`profile/${normalizedUserId}/`);
};

export const removeProfileAvatar = async (path: string): Promise<void> => {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return;
  }

  const { error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .remove([normalizedPath]);
  if (error) {
    throw new Error(error.message);
  }
};

export const uploadProfileAvatar = async ({
  file,
  userId
}: {
  file: File;
  userId: string;
}): Promise<{ storagePath: string; publicUrl: string }> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Select an image file.");
  }

  if (file.size > MAX_PROFILE_AVATAR_FILE_BYTES) {
    throw new Error("Avatar image is too large. Max upload size is 1 MB.");
  }

  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Missing user ID.");
  }

  const compressedBlob = await compressAvatarFile(file);
  const filename = getAvatarFilename();
  const storagePath = `profile/${normalizedUserId}/${filename}`;
  const uploadFile = new File([compressedBlob], filename, {
    type: "image/jpeg"
  });

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(storagePath, uploadFile, {
      cacheControl: "31536000",
      upsert: false,
      contentType: "image/jpeg"
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData.publicUrl?.trim();
  if (!publicUrl) {
    throw new Error("Failed to create avatar URL.");
  }

  return {
    storagePath,
    publicUrl
  };
};
