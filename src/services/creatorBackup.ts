import {
  FEATURE_KEYS,
  type CreatorProfile,
} from "../domain/creator";
import type { FaceFeatureVector } from "../domain/faceFeatures";

interface SerializedCreator extends Omit<CreatorProfile, "referencePhoto"> {
  referencePhoto: string;
}

interface CreatorBackup {
  format: "makeup-match-creators";
  version: 1;
  exportedAt: string;
  creators: SerializedCreator[];
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 32_768));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

function dataUrlToBlob(value: string): Blob {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("备份中的参考照片格式无效");

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`备份中的字段 ${key} 无效`);
  }
  return field;
}

function parseFeatureVector(value: unknown): FaceFeatureVector {
  if (!isRecord(value)) throw new Error("备份中的面部特征格式无效");

  const entries = FEATURE_KEYS.map((key) => {
    const feature = value[key];
    if (typeof feature !== "number" || !Number.isFinite(feature)) {
      throw new Error(`备份中的特征 ${key} 无效`);
    }
    return [key, feature] as const;
  });
  return Object.fromEntries(entries) as FaceFeatureVector;
}

function parseCreator(value: unknown): CreatorProfile {
  if (!isRecord(value)) throw new Error("备份中的博主资料格式无效");

  if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")) {
    throw new Error("备份中的标签格式无效");
  }

  return {
    id: readString(value, "id"),
    name: readString(value, "name"),
    referencePhoto: dataUrlToBlob(readString(value, "referencePhoto")),
    referencePhotoName: readString(value, "referencePhotoName"),
    douyinUrl: readString(value, "douyinUrl"),
    tutorialUrl: readString(value, "tutorialUrl"),
    tags: [...value.tags],
    featureVector: parseFeatureVector(value.featureVector),
    createdAt: readString(value, "createdAt"),
    updatedAt: readString(value, "updatedAt"),
  };
}

export async function createCreatorBackup(
  creators: CreatorProfile[],
): Promise<Blob> {
  const serialized = await Promise.all(
    creators.map(async (creator) => ({
      ...creator,
      referencePhoto: await blobToDataUrl(creator.referencePhoto),
    })),
  );
  const backup: CreatorBackup = {
    format: "makeup-match-creators",
    version: 1,
    exportedAt: new Date().toISOString(),
    creators: serialized,
  };
  return new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
}

export async function parseCreatorBackup(file: Blob): Promise<CreatorProfile[]> {
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error("无法读取备份文件");
  }

  if (
    !isRecord(value) ||
    value.format !== "makeup-match-creators" ||
    value.version !== 1 ||
    !Array.isArray(value.creators)
  ) {
    throw new Error("这不是受支持的博主库备份");
  }
  return value.creators.map(parseCreator);
}
