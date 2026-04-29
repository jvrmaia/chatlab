export type MediaType = "image" | "audio" | "video" | "document" | "sticker";

export const ALLOWED_MIME_BY_TYPE: Record<MediaType, RegExp> = {
  image: /^image\//,
  audio: /^audio\//,
  video: /^video\//,
  document: /^application\/|^text\//,
  sticker: /^image\/webp$|^image\//,
};

export interface MediaRecord {
  id: string;
  type: MediaType;
  mime_type: string;
  size: number;
  sha256: string;
  filename?: string;
  created_at: string;
}

export const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
