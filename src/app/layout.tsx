import type { Metadata } from "next";
import "@/app/globals.css";
import { AppProvider } from "@/components/providers/app-provider";
import { DEFAULT_OWNER_BOOTSTRAP, OWNER_ADMIN_CREDENTIALS } from "@/lib/demo-auth";
import { hashSecret } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Simple POS",
  description: "Cloud-ready simple POS starter for KSA shops and service businesses."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ownerEmail = process.env.POS_OWNER_EMAIL?.trim() || DEFAULT_OWNER_BOOTSTRAP.email;
  const ownerPassword = process.env.POS_OWNER_PASSWORD || OWNER_ADMIN_CREDENTIALS.password;

  return (
    <html lang="en">
      <body>
        <AppProvider
          ownerBootstrap={{
            email: ownerEmail,
            passwordHash: hashSecret(ownerPassword)
          }}
        >
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
