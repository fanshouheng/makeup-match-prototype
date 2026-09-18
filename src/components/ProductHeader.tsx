import type { MouseEventHandler } from "react";
import { ProductNav, type ProductNavSection } from "./ProductNav";

interface ProductHeaderProps {
  current?: ProductNavSection;
  navLabel?: string;
  onHomeClick?: MouseEventHandler<HTMLAnchorElement>;
  productLabel?: string;
}

export function ProductHeader({
  current,
  navLabel = "产品导航",
  onHomeClick,
  productLabel = "MAKEUP REFERENCE",
}: ProductHeaderProps) {
  return (
    <header className="site-header">
      <a aria-label="MAKE UP 首页" className="wordmark" href="/" onClick={onHomeClick}>
        <span className="wordmark-name">MAKE UP</span>
        <span className="wordmark-product">{productLabel}</span>
      </a>
      <ProductNav
        className="site-nav product-nav"
        current={current}
        label={navLabel}
      />
    </header>
  );
}
