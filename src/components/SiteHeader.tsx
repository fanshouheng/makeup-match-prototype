import type { ReferenceAudience } from "../domain/creator";
import { ProductHeader } from "./ProductHeader";

export type SiteView = "home" | "analysis" | "creators" | "privacy";

interface SiteHeaderProps {
  currentView: SiteView;
  referenceAudience: ReferenceAudience;
  onNavigate: (view: SiteView) => void;
}

export function SiteHeader({
  currentView,
  referenceAudience,
  onNavigate,
}: SiteHeaderProps) {
  return (
    <ProductHeader
      current={currentView === "home" || currentView === "analysis" ? "match" : undefined}
      navLabel="站点导航"
      onHomeClick={(event) => {
        event.preventDefault();
        onNavigate("home");
      }}
      productLabel={currentView === "analysis" && referenceAudience === "men"
        ? "MEN'S REPORT"
        : "MAKEUP REFERENCE"}
    />
  );
}
