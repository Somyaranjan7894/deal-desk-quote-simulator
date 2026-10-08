import { DiscountTier } from "@/types";
import { formatPercentage } from "@/lib/formatters";

interface TierIndicatorProps {
  tiers: DiscountTier[];
  currentTier?: string;
  seats: number | "";
  discountPct?: number | string;
}

export function TierIndicator({
  tiers,
  currentTier,
  seats,
  discountPct,
}: TierIndicatorProps) {
  if (!tiers || tiers.length === 0) return null;

  // Determine active tier either from backend calculation or seat matching
  const activeCode = (currentTier || "").toUpperCase();

  const activeTier = tiers.find((tier) =>
    activeCode
      ? activeCode === tier.code.toUpperCase()
      : typeof seats === "number" && seats >= tier.min_seats && seats <= tier.max_seats
  );

  const numericDiscount =
    discountPct !== undefined && discountPct !== ""
      ? typeof discountPct === "number"
        ? discountPct
        : parseFloat(String(discountPct))
      : null;

  const maxDiscount = activeTier
    ? typeof activeTier.max_discount_pct === "number"
      ? activeTier.max_discount_pct
      : parseFloat(String(activeTier.max_discount_pct))
    : null;

  const hasDiscountEntered = numericDiscount !== null && !isNaN(numericDiscount);
  const exceedsTierCap =
    hasDiscountEntered && maxDiscount !== null && numericDiscount > maxDiscount;

  return (
    <div>
      <div className="tier-strip" role="region" aria-label="Seat Discount Tiers">
        {tiers.map((tier) => {
          const isActive =
            activeCode === tier.code.toUpperCase() ||
            (typeof seats === "number" &&
              seats >= tier.min_seats &&
              seats <= tier.max_seats);

          const maxLabel =
            tier.max_seats >= 99999 ? "+" : `–${tier.max_seats}`;

          return (
            <div
              key={tier.code}
              className={`tier-pill ${isActive ? "active" : ""}`}
            >
              <div className="tier-pill-name">{tier.code}</div>
              <div className="tier-pill-detail">
                {tier.min_seats}
                {maxLabel} seats
              </div>
              <div className="tier-pill-detail" style={{ fontWeight: 600 }}>
                Max {formatPercentage(tier.max_discount_pct)}
              </div>
            </div>
          );
        })}
      </div>

      {activeTier && maxDiscount !== null && (
        <div
          className={`tier-limit-status ${
            hasDiscountEntered
              ? exceedsTierCap
                ? "invalid"
                : "valid"
              : "valid"
          }`}
          data-testid="tier-limit-status"
        >
          <div>
            <span>Current Tier: <strong>{activeTier.code}</strong></span>
            <span style={{ margin: "0 0.5rem", opacity: 0.5 }}>|</span>
            <span>Maximum Discount: <strong>{formatPercentage(maxDiscount)}</strong></span>
          </div>

          {hasDiscountEntered && (
            <div style={{ fontWeight: 600 }}>
              <span>
                {numericDiscount}% / {maxDiscount}%
              </span>
              <span style={{ marginLeft: "0.5rem" }}>
                {exceedsTierCap ? "✕ Exceeds tier limit" : "✓ Within tier limit"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
