import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "../components/nav";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Comment Copilot",
  description: "AI comment copilot for TikTok and Instagram creators"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <Nav />
          <main>{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
