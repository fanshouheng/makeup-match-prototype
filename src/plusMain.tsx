import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PlusApp from "./plus/PlusApp";
import { accountClient } from "./services/accountClient";
import "./styles.css";

const isLegacyPlusRoute = window.location.pathname === "/plus.html" ||
  window.location.pathname === "/plus" ||
  window.location.pathname.startsWith("/plus/");

if (isLegacyPlusRoute) {
  window.history.replaceState({}, "", `/report${window.location.search}${window.location.hash}`);
}

document.title = window.location.pathname.startsWith("/account")
  ? "MAKE UP 账号"
  : window.location.pathname.startsWith("/subscription")
    ? "MAKE UP Pro 订阅"
  : "MAKE UP 妆容报告";

void accountClient?.auth.getSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlusApp />
    <Analytics />
  </StrictMode>,
);
