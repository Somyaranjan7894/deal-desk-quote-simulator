import { useMemo } from "react";
import { formatPercentage } from "@/lib/formatters";

interface DealHealthProps {
  discountPct: number | string;
  approvalRequired?: boolean;
  approvalReasons?: string[];
  annualCommitment?: boolean;
  hasProducts?: boolean;
}

interface HealthIndicator {
  label: string;
  statusText: string;
  statusType: "good" | "warning" | "neutral";
  detail: string;
}

/**
 * Compact, deterministic Deal Health component.
 * Displays transparent, explainable commercial metrics derived directly from authoritative calculations.
 * Never calculates speculative AI scores.
 */
export function DealHealth({
  discountPct,
  approvalRequired = false,
  approvalReasons = [],
  annualCommitment = false,
  hasProducts = true,
}: DealHealthProps) {
  const numericDiscount = typeof discountPct === "number" ? discountPct : parseFloat(String(discountPct)) || 0;

  const indicators: HealthIndicator[] = useMemo(() => {
    // 1. Pricing Metric
    const pricingMetric: HealthIndicator = hasProducts
      ? {
          label: "Pricing",
          statusText: "Good",
          statusType: "good",
          detail: "Catalog unit pricing verified",
        }
      : {
          label: "Pricing",
          statusText: "Incomplete",
          statusType: "neutral",
          detail: "Add products to calculate commercial terms",
        };

    // 2. Discount Metric
    let discountMetric: HealthIndicator;
    if (numericDiscount <= 0) {
      discountMetric = {
        label: "Discount",
        statusText: "Good (0%)",
        statusType: "good",
        detail: "0% standard list pricing",
      };
    } else if (numericDiscount <= 15) {
      discountMetric = {
        label: "Discount",
        statusText: `Standard (${formatPercentage(numericDiscount)})`,
        statusType: "good",
        detail: `${formatPercentage(numericDiscount)} within standard 15% threshold`,
      };
    } else {
      discountMetric = {
        label: "Discount",
        statusText: `Review (${formatPercentage(numericDiscount)})`,
        statusType: "warning",
        detail: `${formatPercentage(numericDiscount)} exceeds 15% approval threshold`,
      };
    }

    // 3. Approval Metric
    const approvalMetric: HealthIndicator = approvalRequired
      ? {
          label: "Approval",
          statusText: "Required",
          statusType: "warning",
          detail:
            approvalReasons.length > 0
              ? `${approvalReasons.length} governance rule(s) triggered`
              : "Deal Desk review required",
        }
      : {
          label: "Approval",
          statusText: "Standard Path",
          statusType: "good",
          detail: "No approval triggers active",
        };

    // 4. Annual Commitment Metric
    const commitmentMetric: HealthIndicator = annualCommitment
      ? {
          label: "Commitment",
          statusText: "Active",
          statusType: "good",
          detail: "12-month commercial term committed",
        }
      : {
          label: "Commitment",
          statusText: "Monthly",
          statusType: "neutral",
          detail: "Standard flexible term without annual lock",
        };

    return [pricingMetric, discountMetric, approvalMetric, commitmentMetric];
  }, [hasProducts, numericDiscount, approvalRequired, approvalReasons, annualCommitment]);

  return (
    <div className="card deal-health-card" aria-label="Deal Health Overview">
      <div className="card-title" style={{ marginBottom: "0.65rem" }}>
        <span style={{ fontSize: "1rem" }}>Deal Health</span>
        <span
          style={{
            fontSize: "0.68rem",
            textTransform: "uppercase",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
          }}
        >
          Authoritative
        </span>
      </div>

      <div className="deal-health-list">
        {indicators.map((item) => {
          const isGood = item.statusType === "good";
          const isWarning = item.statusType === "warning";

          return (
            <div
              key={item.label}
              className={`deal-health-row deal-health-${item.statusType}`}
              title={item.detail}
            >
              <div className="deal-health-row-left">
                <span className={`deal-health-icon icon-${item.statusType}`} aria-hidden="true">
                  {isGood ? "✓" : isWarning ? "⚠" : "—"}
                </span>
                <span className="deal-health-label">{item.label}</span>
              </div>
              <span className={`deal-health-badge badge-${item.statusType}`}>
                {item.statusText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
