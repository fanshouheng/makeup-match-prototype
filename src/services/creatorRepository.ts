import {
  FEATURE_KEYS,
  type CreatorProfile,
} from "../domain/creator";
import type { FaceFeatureVector, PoseMetrics } from "../domain/faceFeatures";
import { getSupabaseClient } from "./supabaseClient";

const PHOTO_BUCKET = "creator-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const CONSENT_VERSION = "2026-07-17";

interface PublicCreatorRow {
  id: string;
  name: string;
  douyin_url: string;
  tutorial_url: string | null;
  reference_photo_path: string;
  feature_vector: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreatorSubmissionInput {
  name: string;
  contactEmail: string;
  douyinUrl: string;
  tutorialUrl: string;
  referencePhoto: File;
  featureVector: FaceFeatureVector;
  qualityMetrics: {
    averageLuminance: number;
    pose: PoseMetrics;
  };
  turnstileToken: string;
}

function parseFeatureVector(value: unknown): FaceFeatureVector {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("博主特征数据格式无效");
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => {
      const feature = record[key];
      if (typeof feature !== "number" || !Number.isFinite(feature)) {
        throw new Error(`博主特征 ${key} 无效`);
      }
      return [key, feature];
    }),
  ) as FaceFeatureVector;
}

export function mapPublicCreatorRow(
  row: PublicCreatorRow,
  referencePhotoUrl: string,
): CreatorProfile {
  return {
    id: row.id,
    name: row.name,
    referencePhotoUrl,
    douyinUrl: row.douyin_url,
    tutorialUrl: row.tutorial_url ?? "",
    featureVector: parseFeatureVector(row.feature_vector),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCreators(): Promise<CreatorProfile[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("creators")
    .select(
      "id,name,douyin_url,tutorial_url,reference_photo_path,feature_vector,created_at,updated_at",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as PublicCreatorRow[];
  if (rows.length === 0) return [];

  const paths = rows.map((row) => row.reference_photo_path);
  const signed = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (signed.error) throw signed.error;

  const signedUrls = new Map(
    (signed.data ?? []).flatMap((item) =>
      item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );

  return rows.map((row) => {
    const photoUrl = signedUrls.get(row.reference_photo_path);
    if (!photoUrl) throw new Error(`无法读取 ${row.name} 的参考照`);
    return mapPublicCreatorRow(row, photoUrl);
  });
}

export async function submitCreator(
  input: CreatorSubmissionInput,
): Promise<void> {
  const supabase = await getSupabaseClient();
  const body = new FormData();
  body.set("name", input.name);
  body.set("contactEmail", input.contactEmail);
  body.set("douyinUrl", input.douyinUrl);
  body.set("tutorialUrl", input.tutorialUrl);
  body.set("referencePhoto", input.referencePhoto);
  body.set("featureVector", JSON.stringify(input.featureVector));
  body.set("qualityMetrics", JSON.stringify(input.qualityMetrics));
  body.set("consentVersion", CONSENT_VERSION);
  body.set("turnstileToken", input.turnstileToken);

  const { error } = await supabase.functions.invoke("submit-creator", { body });
  if (!error) return;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }

  if (code === "rate_limited") {
    throw new Error("申请次数过多，请一小时后再试。");
  }
  if (code === "captcha_failed") {
    throw new Error("安全验证已失效，请重新验证后提交。");
  }
  throw new Error("提交失败，请稍后重试。");
}
