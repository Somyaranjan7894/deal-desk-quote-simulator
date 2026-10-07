import { QuoteStatus } from "@/types";

interface StatusBadgeProps {
  status: QuoteStatus | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = (status || "draft").toLowerCase();

  let className = "badge badge-draft";
  let label = "DRAFT";

  switch (normalized) {
    case "submitted":
      className = "badge badge-submitted";
      label = "SUBMITTED";
      break;
    case "approved":
      className = "badge badge-approved";
      label = "APPROVED";
      break;
    case "rejected":
      className = "badge badge-rejected";
      label = "REJECTED";
      break;
    default:
      className = "badge badge-draft";
      label = "DRAFT";
      break;
  }

  return <span className={className}>{label}</span>;
}
