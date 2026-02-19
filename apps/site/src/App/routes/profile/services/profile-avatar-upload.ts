import { supabase } from "../../../lib/supabase";
import { PROFILE_AVATAR_BUCKET } from "../../../features/auth/services/user-profile";

export const MAX_PROFILE_AVATAR_FILE_BYTES = 1 * 1024 * 1024;

const AVATAR_TARGET_BYTES = 140 * 1024;
const AVATAR_MAX_DIMENSION = 360;
const AVATAR_QUALITY_STEPS = [0.7, 0.58, 0.46, 0.36, 0.28];
const AVATAR_SCALE_STEPS = [1, 0.84, 0.68, 0.52];

const toBlob = (
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress avatar image."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read avatar image."));
    };
    image.src = objectUrl;
  });
};

const getBaseSize = (width: number, height: number) => {
  const maxEdge = Math.max(width, height);
  const baseScale = maxEdge > AVATAR_MAX_DIMENSION ? AVATAR_MAX_DIMENSION / maxEdge : 1;

  return {
    width: Math.max(1, Math.round(width * baseScale)),
    height: Math.max(1, Math.round(height * baseScale))
  };
};

const renderAvatarCanvas = (
  image: HTMLImageElement,
  width: number,
  height: number
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process avatar image.");
  }

  // Fill transparent regions before encoding JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
};

const compressAvatarFile = async (file: File): Promise<Blob> => {
  const image = await loadImageFromFile(file);
  const baseSize = getBaseSize(image.naturalWidth || image.width, image.naturalHeight || image.height);

  let smallestBlob: Blob | null = null;

  for (const scale of AVATAR_SCALE_STEPS) {
    const width = Math.max(1, Math.round(baseSize.width * scale));
    const height = Math.max(1, Math.round(baseSize.height * scale));
    const canvas = renderAvatarCanvas(image, width, height);

    for (const quality of AVATAR_QUALITY_STEPS) {
      const blob = await toBlob(canvas, quality);
      if (!smallestBlob || blob.size < smallestBlob.size) {
        smallestBlob = blob;
      }

      if (blob.size <= AVATAR_TARGET_BYTES) {
        return blob;
      }
    }
  }

  if (!smallestBlob) {
    throw new Error("Could not compress avatar image.");
  }

  return smallestBlob;
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
