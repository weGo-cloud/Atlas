import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "The AI-native business operating system.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
