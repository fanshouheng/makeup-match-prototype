export type ProductNavSection = "match" | "report" | "subscription" | "account";

interface ProductNavProps {
  className?: string;
  current?: ProductNavSection;
  label?: string;
}

const navigationItems: Array<{
  href: string;
  label: string;
  section: ProductNavSection;
  shortLabel: string;
}> = [
  { href: "/#start", label: "找美妆博主", section: "match", shortLabel: "匹配" },
  { href: "/report", label: "生成报告", section: "report", shortLabel: "报告" },
  { href: "/subscription", label: "MAKE UP Pro", section: "subscription", shortLabel: "Pro" },
  { href: "/account", label: "我的", section: "account", shortLabel: "我的" },
];

export function ProductNav({
  className = "product-nav",
  current,
  label = "产品导航",
}: ProductNavProps) {
  return (
    <nav className={className} aria-label={label}>
      {navigationItems.map((item) => (
        <a
          aria-current={current === item.section ? "page" : undefined}
          aria-label={item.label}
          href={item.href}
          key={item.section}
        >
          <span aria-hidden="true" className="product-nav-label-long">{item.label}</span>
          <span aria-hidden="true" className="product-nav-label-short">{item.shortLabel}</span>
        </a>
      ))}
    </nav>
  );
}
