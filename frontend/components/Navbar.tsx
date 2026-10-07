"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const pathname = usePathname();

  const isBuilder = pathname === "/";
  const isQuotes = pathname.startsWith("/quotes");

  return (
    <header className="navbar">
      <div className="navbar-container">
        <Link href="/" className="brand">
          <div className="brand-icon">D</div>
          <div className="brand-text">
            <span className="brand-title">Deal Desk</span>
            <span className="brand-subtitle">Quote Simulator</span>
          </div>
        </Link>

        <nav className="nav-links">
          <Link
            href="/"
            className={`nav-link ${isBuilder ? "active" : ""}`}
            aria-current={isBuilder ? "page" : undefined}
          >
            Quote Builder
          </Link>
          <Link
            href="/quotes"
            className={`nav-link ${isQuotes ? "active" : ""}`}
            aria-current={isQuotes ? "page" : undefined}
          >
            Saved Quotes
          </Link>
        </nav>
      </div>
    </header>
  );
}
