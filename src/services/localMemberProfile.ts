import type { ReferenceAudience } from "../domain/creator";
import type { FaceAnalysis } from "../domain/faceFeatures";
import type {
  MaleReportMode,
  MaleReportStyle,
} from "../domain/maleReportStyles";
import type { MaleFaceReport } from "./maleFaceReport";

const DATABASE_NAME = "make-up-local-member-profile";
const DATABASE_VERSION = 1;
const ANALYSIS_STORE = "analyses";
const REPORT_STORE = "reports";
const PENDING_OWNER = "pending";

export interface LocalMemberAnalysis {
  ownerKey: string;
  savedAt: string;
  referenceAudience: ReferenceAudience;
  fileName: string;
  photo: Blob;
  analysis: FaceAnalysis;
  luminance: number;
}

export interface LocalMemberReport {
  id: string;
  ownerKey: string;
  createdAt: string;
  mode: MaleReportMode;
  style: MaleReportStyle;
  report: MaleFaceReport;
}

export interface LocalMemberProfile {
  analysis?: LocalMemberAnalysis;
  reports: LocalMemberReport[];
}

interface SaveAnalysisInput {
  savedAt?: string;
  referenceAudience: ReferenceAudience;
  fileName: string;
  photo: Blob;
  analysis: FaceAnalysis;
  luminance: number;
}

interface SaveReportInput {
  id?: string;
  createdAt?: string;
  mode: MaleReportMode;
  style: MaleReportStyle;
  report: MaleFaceReport;
}

let databasePromise: Promise<IDBDatabase> | undefined;

export function localMemberOwnerKey(userId?: string): string {
  return userId ? `user:${userId}` : PENDING_OWNER;
}

export function buildLocalAnalysisRecord(
  input: SaveAnalysisInput,
  userId?: string,
): LocalMemberAnalysis {
  return {
    ownerKey: localMemberOwnerKey(userId),
    savedAt: input.savedAt ?? new Date().toISOString(),
    referenceAudience: input.referenceAudience,
    fileName: input.fileName,
    photo: input.photo,
    analysis: input.analysis,
    luminance: input.luminance,
  };
}

export function buildLocalReportRecord(
  input: SaveReportInput,
  userId?: string,
): LocalMemberReport {
  return {
    id: input.id ?? crypto.randomUUID(),
    ownerKey: localMemberOwnerKey(userId),
    createdAt: input.createdAt ?? new Date().toISOString(),
    mode: input.mode,
    style: input.style,
    report: input.report,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ANALYSIS_STORE)) {
          database.createObjectStore(ANALYSIS_STORE, { keyPath: "ownerKey" });
        }
        if (!database.objectStoreNames.contains(REPORT_STORE)) {
          database.createObjectStore(REPORT_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开本机会员档案。"));
    });
  }
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本机会员档案读取失败。"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本机会员档案保存失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本机会员档案保存已取消。"));
  });
}

async function getAnalysis(ownerKey: string): Promise<LocalMemberAnalysis | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(ANALYSIS_STORE, "readonly");
  return requestResult<LocalMemberAnalysis | undefined>(
    transaction.objectStore(ANALYSIS_STORE).get(ownerKey),
  );
}

async function putAnalysis(record: LocalMemberAnalysis): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
  transaction.objectStore(ANALYSIS_STORE).put(record);
  await transactionDone(transaction);
}

async function deleteAnalysis(ownerKey: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
  transaction.objectStore(ANALYSIS_STORE).delete(ownerKey);
  await transactionDone(transaction);
}

async function getReports(): Promise<LocalMemberReport[]> {
  const database = await openDatabase();
  const transaction = database.transaction(REPORT_STORE, "readonly");
  return requestResult<LocalMemberReport[]>(
    transaction.objectStore(REPORT_STORE).getAll(),
  );
}

async function putReport(record: LocalMemberReport): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(REPORT_STORE, "readwrite");
  transaction.objectStore(REPORT_STORE).put(record);
  await transactionDone(transaction);
}

export async function saveLatestLocalAnalysis(
  input: SaveAnalysisInput,
  userId?: string,
): Promise<void> {
  await putAnalysis(buildLocalAnalysisRecord(input, userId));
}

export async function loadLatestLocalAnalysis(
  userId?: string,
): Promise<LocalMemberAnalysis | undefined> {
  return getAnalysis(localMemberOwnerKey(userId));
}

export async function clearLatestLocalAnalysis(userId?: string): Promise<void> {
  await deleteAnalysis(localMemberOwnerKey(userId));
}

export async function saveLocalGeneratedReport(
  input: SaveReportInput,
  userId?: string,
): Promise<void> {
  await putReport(buildLocalReportRecord(input, userId));
}

export async function claimPendingMemberData(userId: string): Promise<void> {
  const pendingAnalysis = await getAnalysis(PENDING_OWNER);
  if (pendingAnalysis) {
    const ownerKey = localMemberOwnerKey(userId);
    const currentAnalysis = await getAnalysis(ownerKey);
    if (!currentAnalysis || pendingAnalysis.savedAt > currentAnalysis.savedAt) {
      await putAnalysis({ ...pendingAnalysis, ownerKey });
    }
    await deleteAnalysis(PENDING_OWNER);
  }

  const pendingReports = (await getReports()).filter(
    (report) => report.ownerKey === PENDING_OWNER,
  );
  await Promise.all(
    pendingReports.map((report) => putReport({
      ...report,
      ownerKey: localMemberOwnerKey(userId),
    })),
  );
}

export async function loadLocalMemberProfile(
  userId: string,
): Promise<LocalMemberProfile> {
  const ownerKey = localMemberOwnerKey(userId);
  const [analysis, reports] = await Promise.all([
    getAnalysis(ownerKey),
    getReports(),
  ]);
  return {
    analysis,
    reports: reports
      .filter((report) => report.ownerKey === ownerKey)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export async function deleteLocalMemberProfile(userId: string): Promise<void> {
  const ownerKey = localMemberOwnerKey(userId);
  const reports = (await getReports()).filter(
    (report) => report.ownerKey === ownerKey,
  );
  const database = await openDatabase();
  const transaction = database.transaction(
    [ANALYSIS_STORE, REPORT_STORE],
    "readwrite",
  );
  transaction.objectStore(ANALYSIS_STORE).delete(ownerKey);
  const reportStore = transaction.objectStore(REPORT_STORE);
  reports.forEach((report) => reportStore.delete(report.id));
  await transactionDone(transaction);
}
