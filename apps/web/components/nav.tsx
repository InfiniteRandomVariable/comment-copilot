import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/inbox", label: "Inbox" },
  { href: "/usage", label: "Usage" },
  { href: "/skills", label: "Skills" },
  { href: "/settings", label: "Autopilot" },
  { href: "/billing", label: "Billing" }
];

export function Nav() {
  return (
    <header style={{ borderBottom: "1px solid #d8dedf", background: "#ffffffd9" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <strong>Comment Copilot</strong>
        <nav style={{ display: "flex", gap: 16 }}>
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
