export type SiteView = "home" | "analysis" | "creators" | "privacy";

interface SiteHeaderProps {
  currentView: SiteView;
  onNavigate: (view: SiteView) => void;
}

export function SiteHeader({ currentView, onNavigate }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <button className="wordmark" onClick={() => onNavigate("home")} type="button">
        <span>妆容参照</span>
      </button>
      <nav className="site-nav" aria-label="站点导航">
        <button
          aria-current={currentView === "creators" ? "page" : undefined}
          onClick={() => onNavigate("creators")}
          type="button"
        >
          博主入驻
        </button>
        <button
          aria-current={currentView === "privacy" ? "page" : undefined}
          onClick={() => onNavigate("privacy")}
          type="button"
        >
          隐私
        </button>
      </nav>
    </header>
  );
}
