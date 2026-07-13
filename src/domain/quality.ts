import type { PoseMetrics } from "./faceFeatures";

export type QualityIssueCode =
  | "no-face"
  | "multiple-faces"
  | "too-dark"
  | "too-small"
  | "tilted"
  | "side-facing";

export interface QualityIssue {
  code: QualityIssueCode;
  message: string;
}

interface QualityInput {
  faceCount: number;
  averageLuminance: number;
  pose?: PoseMetrics;
}

export function assessPhotoQuality(input: QualityInput): QualityIssue[] {
  if (input.faceCount === 0) {
    return [{ code: "no-face", message: "没有检测到清晰人脸，请换一张正面照片。" }];
  }

  if (input.faceCount > 1) {
    return [
      {
        code: "multiple-faces",
        message: "照片中有多张人脸，请只保留本人正面照。",
      },
    ];
  }

  const issues: QualityIssue[] = [];

  if (input.averageLuminance < 55) {
    issues.push({ code: "too-dark", message: "照片偏暗，请在光线均匀的位置重拍。" });
  }
  if (input.pose && input.pose.faceWidthInImage < 0.25) {
    issues.push({ code: "too-small", message: "人脸在画面中太小，请靠近一些。" });
  }
  if (input.pose && Math.abs(input.pose.rollDegrees) > 10) {
    issues.push({ code: "tilted", message: "头部倾斜较明显，请尽量摆正。" });
  }
  if (input.pose && input.pose.yawAsymmetry > 0.18) {
    issues.push({ code: "side-facing", message: "侧脸角度较大，请正对镜头。" });
  }

  return issues;
}
