import exifReader from "exif-reader";

export interface ExtractedExif {
  exifCameraMake: string | null;
  exifCameraModel: string | null;
  exifFocalLength: number | null;
  exifAperture: number | null;
  exifShutterSpeed: string | null;
  exifIso: number | null;
  exifShootDate: Date | null;
}

function formatExposureTime(et: number): string {
  if (et >= 1) return String(et);
  const denominator = Math.round(1 / et);
  return `1/${denominator}`;
}

export function parseExifBuffer(exifBuffer: Buffer): ExtractedExif | null {
  try {
    const data = exifReader(exifBuffer);
    return {
      exifCameraMake:   (data.Image?.Make?.trim())    ?? null,
      exifCameraModel:  (data.Image?.Model?.trim())   ?? null,
      exifFocalLength:  data.Photo?.FocalLength       ?? null,
      exifAperture:     data.Photo?.FNumber           ?? null,
      exifShutterSpeed: data.Photo?.ExposureTime != null
        ? formatExposureTime(data.Photo.ExposureTime)
        : null,
      exifIso: (data.Photo?.ISOSpeedRatings as number | undefined) ?? null,
      exifShootDate: data.Photo?.DateTimeOriginal instanceof Date
        ? data.Photo.DateTimeOriginal
        : null,
    };
  } catch {
    return null;
  }
}
