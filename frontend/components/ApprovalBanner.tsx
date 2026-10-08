export interface ApprovalBannerProps {
  status?: "idle" | "loading" | "valid" | "invalid" | "error";
  approvalRequired?: boolean | null;
  approvalReasons?: string[] | null;
  errorMessage?: string | null;
}

export function ApprovalBanner({
  status,
  approvalRequired,
  approvalReasons,
  errorMessage,
}: ApprovalBannerProps) {
  // If explicitly invalid, or an error message is present, render INVALID QUOTE
  if (status === "invalid" || (status !== "valid" && errorMessage)) {
    return (
      <div className="approval-banner invalid" role="alert" data-testid="approval-banner-invalid">
        <div className="approval-banner-icon" aria-hidden="true">
          ✕
        </div>
        <div>
          <div className="approval-banner-title">Invalid Quote</div>
          <div>
            {errorMessage ||
              "Requested discount exceeds the maximum allowed discount for this seat tier. Reduce the discount to calculate approval."}
          </div>
        </div>
      </div>
    );
  }

  // If loading or idle without calculation, render nothing
  if (status === "loading" || status === "idle") {
    return null;
  }

  // If calculation is unavailable (not valid and no approvalRequired flag)
  if (approvalRequired === undefined || approvalRequired === null) {
    return null;
  }

  // Valid quote that requires Deal Desk approval
  if (approvalRequired) {
    return (
      <div className="approval-banner required" role="alert" data-testid="approval-banner-required">
        <div className="approval-banner-icon" aria-hidden="true">
          ⚠️
        </div>
        <div>
          <div className="approval-banner-title">Approval Required</div>
          <div>This quote exceeds standard sales authority and requires review:</div>
          {approvalReasons && approvalReasons.length > 0 && (
            <ul className="approval-reasons-list">
              {approvalReasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Valid quote within standard authority (no approval required)
  return (
    <div className="approval-banner standard" role="status" data-testid="approval-banner-standard">
      <div className="approval-banner-icon" aria-hidden="true">
        ✓
      </div>
      <div>
        <div className="approval-banner-title">No Approval Required</div>
        <div>Pricing falls within standard sales representative authority.</div>
      </div>
    </div>
  );
}
