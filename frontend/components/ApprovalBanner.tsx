interface ApprovalBannerProps {
  approvalRequired?: boolean | null;
  approvalReasons?: string[] | null;
}

export function ApprovalBanner({
  approvalRequired,
  approvalReasons,
}: ApprovalBannerProps) {
  if (approvalRequired === undefined || approvalRequired === null) {
    return null;
  }

  if (approvalRequired) {
    return (
      <div className="approval-banner required" role="alert">
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

  return (
    <div className="approval-banner standard" role="status">
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
