import { DiscountTier } from "@/types";
import { formatPercentage } from "@/lib/formatters";

interface TierIndicatorProps {
  tiers: DiscountTier[];
  currentTier?: string;
  seats: number | "";
}

export function TierIndicator({ tiers, currentTier, seats }: TierIndicatorProps) {
  if (!tiers || tiers.length === 0) return null;

  // Determine active tier either from backend calculation or seat matching
  const activeCode = (currentTier || "").toUpperCase();

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
    </div>
  );
}
