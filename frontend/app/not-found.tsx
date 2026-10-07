import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
      <h1 className="page-title">404 - Page Not Found</h1>
      <p className="page-description" style={{ marginBottom: "1.5rem" }}>
        The page you are looking for does not exist in Deal Desk.
      </p>
      <Link href="/" className="btn btn-primary">
        Return to Quote Builder
      </Link>
    </div>
  );
}
