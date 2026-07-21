import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const isAdminRoute = window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/");
const AdminApp = lazy(() => import("./admin/AdminApp"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={<main className="admin-loading">正在载入管理台…</main>}>
        <AdminApp />
      </Suspense>
    ) : (
      <>
        <App />
        <Analytics />
        <SpeedInsights />
      </>
    )}
  </StrictMode>,
);
