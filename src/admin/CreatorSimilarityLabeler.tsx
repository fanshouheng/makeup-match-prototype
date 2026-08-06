import {
  Download,
  LoaderCircle,
  RotateCcw,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CreatorProfile } from "../domain/creator";
import { MATCHING_ALGORITHM_VERSION, rankCreators } from "../domain/matching";
import { listCreators } from "../services/creatorRepository";

const LABEL_STORAGE_KEY = "make-up:admin:creator-similarity-labels:v1";
const TARGET_PAIR_COUNT = 300;

export type SimilarityLabel = "similar" | "different";

export interface SimilarityPair {
  id: string;
  left: CreatorProfile;
  right: CreatorProfile;
}

export interface StoredSimilarityLabel {
  pairId: string;
  leftCreatorId: string;
  rightCreatorId: string;
  label: SimilarityLabel;
  labeledAt: string;
}

interface CreatorSimilarityLabelerProps {
  creators?: CreatorProfile[];
}

function pairId(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join(":");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createPair(left: CreatorProfile, right: CreatorProfile): SimilarityPair {
  const id = pairId(left.id, right.id);
  return stableHash(id) % 2 === 0
    ? { id, left, right }
    : { id, left: right, right: left };
}

export function buildSimilarityLabelingQueue(
  creators: CreatorProfile[],
  limit = TARGET_PAIR_COUNT,
): SimilarityPair[] {
  const sortedCreators = [...creators].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const pairsById = new Map<string, SimilarityPair>();

  for (const creator of sortedCreators) {
    const nearest = rankCreators(creator.featureVector, sortedCreators, { limit: 5 })
      .filter((match) => match.creator.id !== creator.id)
      .slice(0, 3);
    for (const match of nearest) {
      const pair = createPair(creator, match.creator);
      pairsById.set(pair.id, pair);
    }
  }

  const nearestPairs = [...pairsById.values()].sort(
    (left, right) => stableHash(left.id) - stableHash(right.id),
  );
  const broadPairs: SimilarityPair[] = [];
  for (let leftIndex = 0; leftIndex < sortedCreators.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sortedCreators.length;
      rightIndex += 1
    ) {
      const pair = createPair(
        sortedCreators[leftIndex],
        sortedCreators[rightIndex],
      );
      if (!pairsById.has(pair.id)) broadPairs.push(pair);
    }
  }
  broadPairs.sort((left, right) => stableHash(left.id) - stableHash(right.id));

  const queue: SimilarityPair[] = [];
  let nearestIndex = 0;
  let broadIndex = 0;
  while (
    queue.length < limit &&
    (nearestIndex < nearestPairs.length || broadIndex < broadPairs.length)
  ) {
    if (nearestIndex < nearestPairs.length) {
      queue.push(nearestPairs[nearestIndex]);
      nearestIndex += 1;
    }
    if (queue.length < limit && broadIndex < broadPairs.length) {
      queue.push(broadPairs[broadIndex]);
      broadIndex += 1;
    }
  }
  return queue;
}

function isStoredLabel(value: unknown): value is StoredSimilarityLabel {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const label = value as Record<string, unknown>;
  return (
    typeof label.pairId === "string" &&
    typeof label.leftCreatorId === "string" &&
    typeof label.rightCreatorId === "string" &&
    (label.label === "similar" || label.label === "different") &&
    typeof label.labeledAt === "string"
  );
}

function loadStoredLabels(): StoredSimilarityLabel[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(LABEL_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.filter(isStoredLabel) : [];
  } catch {
    return [];
  }
}

export function createSimilarityLabelExport(
  labels: StoredSimilarityLabel[],
  creatorLibrarySize: number,
  exportedAt = new Date(),
) {
  return {
    schemaVersion: 1,
    algorithmVersion: MATCHING_ALGORITHM_VERSION,
    exportedAt: exportedAt.toISOString(),
    creatorLibrarySize,
    labels: [...labels].sort((left, right) =>
      left.labeledAt.localeCompare(right.labeledAt),
    ),
  };
}

export function createSimilarityLabelDownload(
  labels: StoredSimilarityLabel[],
  creatorLibrarySize: number,
  exportedAt = new Date(),
) {
  const payload = createSimilarityLabelExport(
    labels,
    creatorLibrarySize,
    exportedAt,
  );
  return {
    fileName: `make-up-similarity-labels-${exportedAt.toISOString().slice(0, 10)}.json`,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`,
  };
}

export function CreatorSimilarityLabeler({
  creators: suppliedCreators,
}: CreatorSimilarityLabelerProps) {
  const [loadedCreators, setLoadedCreators] = useState<CreatorProfile[]>();
  const [loadError, setLoadError] = useState("");
  const [labels, setLabels] = useState<StoredSimilarityLabel[]>(loadStoredLabels);
  const [skippedPairIds, setSkippedPairIds] = useState<Set<string>>(new Set());

  const creators = suppliedCreators ?? loadedCreators;

  useEffect(() => {
    if (suppliedCreators) return;
    let active = true;
    listCreators("women")
      .then((nextCreators) => {
        if (active) setLoadedCreators(nextCreators);
      })
      .catch(() => {
        if (active) setLoadError("无法读取公开创作者库，请稍后重试。");
      });
    return () => {
      active = false;
    };
  }, [suppliedCreators]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(labels));
    }
  }, [labels]);

  const queue = useMemo(
    () => buildSimilarityLabelingQueue(creators ?? []),
    [creators],
  );
  const labelsByPair = useMemo(
    () => new Map(labels.map((label) => [label.pairId, label])),
    [labels],
  );
  const currentPair = queue.find(
    (pair) => !labelsByPair.has(pair.id) && !skippedPairIds.has(pair.id),
  );
  const queueLabels = labels.filter((label) =>
    queue.some((pair) => pair.id === label.pairId),
  );
  const similarCount = queueLabels.filter((label) => label.label === "similar").length;
  const differentCount = queueLabels.length - similarCount;
  const exportDownload = useMemo(
    () => createSimilarityLabelDownload(labels, creators?.length ?? 0),
    [creators?.length, labels],
  );

  function recordLabel(label: SimilarityLabel) {
    if (!currentPair) return;
    const nextLabel: StoredSimilarityLabel = {
      pairId: currentPair.id,
      leftCreatorId: currentPair.left.id,
      rightCreatorId: currentPair.right.id,
      label,
      labeledAt: new Date().toISOString(),
    };
    setLabels((current) => [
      ...current.filter((entry) => entry.pairId !== currentPair.id),
      nextLabel,
    ]);
  }

  function undoLastLabel() {
    setLabels((current) => current.slice(0, -1));
  }

  function skipCurrentPair() {
    if (!currentPair) return;
    setSkippedPairIds((current) => new Set(current).add(currentPair.id));
  }

  function resetLabels() {
    if (!window.confirm("清除本机保存的全部相似度标注？此操作无法撤销。")) return;
    setLabels([]);
    setSkippedPairIds(new Set());
  }

  if (loadError) {
    return <div className="admin-alert" role="alert">{loadError}</div>;
  }
  if (!creators) {
    return (
      <div className="admin-loading admin-loading-inline">
        <LoaderCircle className="admin-spin" size={22} />正在生成标注队列…
      </div>
    );
  }
  if (creators.length < 2) {
    return (
      <div className="admin-empty">
        <h3>创作者数量不足</h3>
        <p>至少需要两位已授权创作者才能进行相似度标注。</p>
      </div>
    );
  }

  return (
    <section className="admin-similarity-labeler" aria-labelledby="similarity-labeler-title">
      <div className="admin-similarity-heading">
        <div>
          <p className="admin-kicker">PAIRWISE LABELING</p>
          <h2 id="similarity-labeler-title">创作者相似度标注</h2>
        </div>
        <div className="admin-similarity-tools">
          <button
            aria-label="撤销上一条标注"
            className="admin-icon-button"
            disabled={labels.length === 0}
            onClick={undoLastLabel}
            title="撤销上一条标注"
            type="button"
          >
            <Undo2 size={17} />
          </button>
          {labels.length === 0 ? (
            <button className="admin-secondary-button" disabled type="button">
              <Download size={16} />导出标注
            </button>
          ) : (
            <a
              className="admin-secondary-button"
              download={exportDownload.fileName}
              href={exportDownload.href}
            >
              <Download size={16} />导出标注
            </a>
          )}
          <button
            aria-label="清空标注"
            className="admin-icon-button admin-icon-button-danger"
            disabled={labels.length === 0}
            onClick={resetLabels}
            title="清空标注"
            type="button"
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </div>

      <div className="admin-similarity-stats" aria-label="标注进度">
        <div><span>进度</span><strong>{queueLabels.length} / {queue.length}</strong></div>
        <div><span>像</span><strong>{similarCount}</strong></div>
        <div><span>不像</span><strong>{differentCount}</strong></div>
        <div><span>本轮创作者</span><strong>{creators.length}</strong></div>
      </div>

      {currentPair ? (
        <>
          <div className="admin-similarity-pair">
            <figure>
              <img src={currentPair.left.referencePhotoUrl} alt="左侧创作者参考照" />
            </figure>
            <div className="admin-similarity-versus" aria-hidden="true">VS</div>
            <figure>
              <img src={currentPair.right.referencePhotoUrl} alt="右侧创作者参考照" />
            </figure>
          </div>
          <div className="admin-similarity-actions">
            <button
              className="admin-similarity-no"
              onClick={() => recordLabel("different")}
              type="button"
            >
              <ThumbsDown size={20} />不像
            </button>
            <button
              aria-label="跳过这一对"
              className="admin-icon-button"
              onClick={skipCurrentPair}
              title="跳过这一对"
              type="button"
            >
              <SkipForward size={19} />
            </button>
            <button
              className="admin-similarity-yes"
              onClick={() => recordLabel("similar")}
              type="button"
            >
              <ThumbsUp size={20} />像
            </button>
          </div>
        </>
      ) : queueLabels.length === queue.length ? (
        <div className="admin-empty">
          <ThumbsUp size={28} />
          <h3>本轮标注完成</h3>
          <a
            className="admin-primary-button"
            download={exportDownload.fileName}
            href={exportDownload.href}
          >
            <Download size={16} />导出标注
          </a>
        </div>
      ) : (
        <div className="admin-empty">
          <SkipForward size={28} />
          <h3>剩余对比已跳过</h3>
          <button
            className="admin-secondary-button"
            onClick={() => setSkippedPairIds(new Set())}
            type="button"
          >
            重新查看
          </button>
        </div>
      )}
    </section>
  );
}
