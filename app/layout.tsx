import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono, Noto_Naskh_Arabic, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/providers/query-provider";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { CompanyProvider } from "@/lib/providers/company-provider";
import { PlanProvider } from "@/lib/providers/plan-provider";
import { LanguageProvider } from "@/lib/i18n/provider";
import { getServerLanguage } from "@/lib/i18n/server";
import { loadMessages } from "@/lib/i18n/load";
import { FONT_STYLESHEETS, languageInfo } from "@/lib/i18n/config";
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from "@/lib/brand";

const fraunces = Fraunces({
  variable: "--font-heading-latin",
  subsets: ["latin"],
  axes: ["opsz"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-latin",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Fonts for the other scripts. preload is off: the browser downloads one only when the page actually shows
// text in that script, so a visitor in English never pays for them (see the html[lang] rules in globals.css).
const naskh = Noto_Naskh_Arabic({ variable: "--font-naskh", subsets: ["arabic"], display: "swap", preload: false });
const nastaliq = Noto_Nastaliq_Urdu({ variable: "--font-nastaliq", subsets: ["arabic"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The language comes from the cookie the picker writes, so the very first paint has the right text,
  // direction and font (no flash of English or of a left-to-right layout).
  const lang = await getServerLanguage();
  const info = languageInfo(lang);
  const messages = await loadMessages(lang);
  return (
    <html
      lang={info.code}
      dir={info.dir}
      suppressHydrationWarning
      className={`${fraunces.variable} ${plusJakarta.variable} ${plexMono.variable} ${naskh.variable} ${nastaliq.variable} h-full antialiased`}
    >
      {FONT_STYLESHEETS[lang] && (<head><link rel="stylesheet" href={FONT_STYLESHEETS[lang]} /></head>)}
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <CompanyProvider>
              <QueryProvider>
                <LanguageProvider initialLang={lang} initialMessages={messages}>
                  <PlanProvider>
                    <TooltipProvider delayDuration={200}>
                      {children}
                      <Toaster richColors />
                    </TooltipProvider>
                  </PlanProvider>
                </LanguageProvider>
              </QueryProvider>
            </CompanyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
