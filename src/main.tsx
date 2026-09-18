import { Analytics } from "@vercel/analytics/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { accountClient } from "./services/accountClient";
import "./styles.css";

const isAdminRoute = window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/");
const isPlusDocumentRoute = window.location.pathname === "/plus.html";
const isLegacyPlusRoute = window.location.pathname === "/plus" ||
  window.location.pathname.startsWith("/plus/");
const isAccountRoute = window.location.pathname === "/account" ||
  window.location.pathname.startsWith("/account/");
const isSubscriptionRoute = window.location.pathname === "/subscription" ||
  window.location.pathname.startsWith("/subscription/");
const isReportRoute = isPlusDocumentRoute || isLegacyPlusRoute || window.location.pathname === "/report" ||
  window.location.pathname.startsWith("/report/");
const isPlusAppRoute = isReportRoute || isAccountRoute || isSubscriptionRoute;
const isSimilarityLabelerRoute =
  window.location.pathname === "/similarity-labeler" ||
  window.location.pathname.startsWith("/similarity-labeler/");
const AdminApp = lazy(() => import("./admin/AdminApp"));
const PlusApp = lazy(() => import("./plus/PlusApp"));
const SimilarityLabelerApp = lazy(() => import("./admin/SimilarityLabelerApp"));

if (isAdminRoute || isSimilarityLabelerRoute) {
  document.title = isAdminRoute ? "MAKE UP 管理台" : "MAKE UP 相似度标注器";
  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex, nofollow, noarchive";
  if (!robots.parentNode) document.head.append(robots);
} else if (isReportRoute) {
  document.title = "MAKE UP 妆容报告";
  if (isLegacyPlusRoute || isPlusDocumentRoute) {
    window.history.replaceState({}, "", `/report${window.location.search}${window.location.hash}`);
  }
} else if (isAccountRoute) {
  document.title = "MAKE UP 账号";
} else if (isSubscriptionRoute) {
  document.title = "MAKE UP Pro 订阅";
}

if (!isAdminRoute && !isSimilarityLabelerRoute) {
  // Initialize the shared public session so email confirmations work on return.
  void accountClient?.auth.getSession();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSimilarityLabelerRoute ? (
      <Suspense fallback={<main className="admin-loading">正在载入相似度标注器…</main>}>
        <SimilarityLabelerApp />
      </Suspense>
    ) : isAdminRoute ? (
      <Suspense fallback={<main className="admin-loading">正在载入管理台…</main>}>
        <AdminApp />
      </Suspense>
    ) : isPlusAppRoute ? (
      <Suspense fallback={<main className="admin-loading">正在载入 MAKE UP…</main>}>
        <PlusApp />
        <Analytics />
      </Suspense>
    ) : (
      <>
        <App />
        <Analytics />
      </>
    )}
  </StrictMode>,
);
