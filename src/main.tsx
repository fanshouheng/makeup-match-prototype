import { Analytics } from "@vercel/analytics/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const isAdminRoute = window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/");
const isPlusRoute = window.location.pathname === "/plus" ||
  window.location.pathname.startsWith("/plus/");
const isSimilarityLabelerRoute =
  window.location.pathname === "/similarity-labeler" ||
  window.location.pathname.startsWith("/similarity-labeler/");
const AdminApp = lazy(() => import("./admin/AdminApp"));
const PlusApp = lazy(() => import("./plus/PlusApp"));
const SimilarityLabelerApp = lazy(() => import("./admin/SimilarityLabelerApp"));

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
    ) : isPlusRoute ? (
      <Suspense fallback={<main className="admin-loading">正在载入 Plus…</main>}>
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
