/**
 * Utility functions for displaying currency, percentages, and dates.
 * Mathematical calculations are exclusively performed by the backend;
 * these helpers are purely for presentation.
 */

export function formatCurrency(
  value: string | number | null | undefined,
  currency = "USD"
): string {
  if (value === null || value === undefined || value === "") {
    return "$0.00";
  }

  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatPercentage(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined || value === "") {
    return "0%";
  }

  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) {
    return "0%";
  }

  // Format with up to 2 decimal places if fractional, otherwise whole number
  return `${num.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) {
    return "—";
  }

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return isoString;
  }
}
