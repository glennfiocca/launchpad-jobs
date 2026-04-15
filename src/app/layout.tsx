import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ProgressBar } from "@/components/layout/progress-bar";
import { FeedbackButton } from "@/components/feedback-button";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pipeline — One-Click Job Applications",
  description: "Apply to top tech jobs in one click. Track your applications, communicate with recruiters, and land your dream job.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        <ProgressBar />
        <Providers>
          {children}
          <FeedbackButton />
        </Providers>
      </body>
    </html>
  );
}
