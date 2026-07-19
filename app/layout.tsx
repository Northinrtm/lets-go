import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LetsGo — события по душе",
  description: "Персональные события Москвы и напоминания в Telegram",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
