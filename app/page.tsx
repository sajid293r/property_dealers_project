"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";
import {
  Building2,
  Users2,
  Landmark,
  MapPinned,
  Receipt,
  UserSquare2,
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Menu,
  ListChecks,
  HandCoins,
  LineChart,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AnimatedNumber } from "@/components/animated-number";
import { PlotGridMotif } from "@/components/plot-grid-motif";
import { PRICING, SEAT_PACKS } from "@/lib/plan";
import { formatPkr } from "@/lib/format";
import { monthlyCollections } from "@/lib/mock-data/trends";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

/** Splits "plain *highlighted* plain" so the middle word can be styled; the marker moves with the translation. */
function Emph({ text, className }: { text: string; className: string }) {
  const parts = text.split("*");
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span key={i} className={className}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

const TIER_CHIP: Record<PlanTier, string> = {
  basic: "bg-secondary text-secondary-foreground border-border",
  moderate: "bg-primary/10 text-primary border-primary/25",
  premium: "bg-gold/15 text-gold border-gold/30",
};

const FEATURES: {
  id: "properties" | "crm" | "accounting" | "plotmap" | "payroll" | "expenses";
  icon: typeof Building2;
  tier: PlanTier;
  big?: boolean;
}[] = [
  { id: "properties", icon: Building2, tier: "basic", big: true },
  { id: "crm", icon: Users2, tier: "moderate" },
  { id: "accounting", icon: Landmark, tier: "moderate" },
  { id: "plotmap", icon: MapPinned, tier: "premium", big: true },
  { id: "payroll", icon: UserSquare2, tier: "moderate" },
  { id: "expenses", icon: Receipt, tier: "basic" },
];

const STEPS = [
  { icon: ListChecks },
  { icon: HandCoins },
  { icon: LineChart },
];

// Deterministic plot-status grid for the "Interactive Plot Map" feature card preview.
const PLOT_PREVIEW = [
  1, 1, 0, 1, 2, 1, 0, 1, 1, 2, 0, 1,
] as const; // 0 = sold, 1 = available, 2 = reserved
const PLOT_COLOR = ["var(--chart-4)", "var(--chart-1)", "var(--gold)"];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteNav />
      <Hero />
      <ModuleMarquee />
      <StatsStrip />
      <FeaturesSection />
      <HowItWorks />
      <PricingSection />
      <CtaBanner />
      <SiteFooter />
    </div>
  );
}

function Logomark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <Building2 className="size-4.5" />
    </div>
  );
}

function SiteNav() {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md transition-shadow duration-300",
        scrolled ? "border-border/60 shadow-sm shadow-foreground/[0.03]" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logomark />
          <span className="font-heading text-[15px] font-semibold">{APP_NAME}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {[
            { href: "#features", label: t("landing.nav.features") },
            { href: "#how-it-works", label: t("landing.nav.how") },
            { href: "#pricing", label: t("landing.nav.pricing") },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group relative py-1 transition-colors hover:text-foreground"
            >
              {item.label}
              <span className="absolute inset-x-0 -bottom-0.5 h-px scale-x-0 bg-primary transition-transform duration-200 ease-out group-hover:scale-x-100" />
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher />
          <Button variant="ghost" asChild>
            <Link href="/dashboard">{t("landing.nav.login")}</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              {t("landing.nav.demo")}
              <ArrowRight className="size-4 rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen(true)}
          aria-label={t("landing.nav.openMenu")}
        >
          <Menu className="size-5" />
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-start">
              <Logomark className="size-7" />
              {APP_NAME}
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4 text-sm">
            {[
              { href: "#features", label: t("landing.nav.features") },
              { href: "#how-it-works", label: t("landing.nav.how") },
              { href: "#pricing", label: t("landing.nav.pricing") },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2.5 py-2.5 text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 px-4">
            <LanguageSwitcher variant="full" align="start" />
            <Button variant="outline" asChild>
              <Link href="/dashboard">{t("landing.nav.login")}</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">
                {t("landing.nav.demo")}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function Hero() {
  const t = useT();
  const heroChartData = monthlyCollections.map((d) => ({ label: d.month, v: d.collections }));
  const mockRef = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = mockRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: px * -4, y: py * 4 });
  }

  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-20 md:px-6 md:pt-28">
      <PlotGridMotif className="h-[640px]" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] opacity-40"
        style={{
          background: "radial-gradient(60% 50% at 50% 0%, var(--accent) 0%, transparent 70%)",
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-24 -z-10 size-72 -translate-x-[130%] rounded-full bg-gold/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-48 -z-10 size-80 translate-x-[60%] rounded-full bg-primary/15 blur-3xl" />

      <div className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/70 px-3 py-1 text-xs font-medium text-secondary-foreground"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {t("landing.hero.badge")}
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="font-heading text-[2.75rem] font-semibold leading-[1.05] tracking-tight md:text-7xl"
        >
          <Emph text={t("landing.hero.title")} className="text-gradient-brand italic rtl:not-italic" />
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
        >
          {t("landing.hero.sub")}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18 }}
          className="mt-8 flex flex-col items-center gap-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/dashboard">
                {t("landing.hero.cta")}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#pricing">{t("landing.hero.seePricing")}</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("landing.hero.note")}
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto mt-16 max-w-5xl [perspective:1400px]"
      >
        <motion.div
          initial={{ opacity: 0, y: -10, rotate: -6 }}
          animate={{ opacity: 1, y: 0, rotate: -6 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="absolute -end-3 -top-5 z-10 hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-md sm:flex"
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
          {t("landing.hero.chipLive")}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: -10, rotate: 5 }}
          animate={{ opacity: 1, y: 0, rotate: 5 }}
          transition={{ duration: 0.5, delay: 1.05 }}
          className="absolute -start-3 -bottom-4 z-10 hidden items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1.5 text-xs font-medium text-gold shadow-md sm:flex"
        >
          <Sparkles className="size-3" />
          {t("landing.hero.chipTiers")}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -start-6 top-24 z-20 hidden xl:block"
        >
          <div className="glass animate-float flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl shadow-primary/10">
            <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success">
              <HandCoins className="size-4.5" />
            </span>
            <div className="text-start">
              <p className="text-xs font-semibold">{t("landing.hero.notifTitle")}</p>
              <p className="text-[11px] text-muted-foreground" dir="ltr">Rs 450,000 · PRP-1042</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -end-6 top-56 z-20 hidden xl:block"
        >
          <div className="glass animate-float-slow flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl shadow-primary/10 [animation-delay:-3s]">
            <span className="flex size-9 items-center justify-center rounded-full bg-gold/20 text-gold">
              <MapPinned className="size-4.5" />
            </span>
            <div className="text-start">
              <p className="text-xs font-semibold">{t("landing.hero.plotTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("landing.hero.plotSub", { project: "Emerald Gardens" })}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          ref={mockRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          animate={{ rotateX: tilt.y, rotateY: tilt.x }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
          style={{ transformStyle: "preserve-3d" }}
          className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-primary/10"
        >
          <div className="flex items-center gap-1.5 border-b border-border/70 bg-secondary/40 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-destructive/50" />
            <span className="size-2.5 rounded-full bg-warning/50" />
            <span className="size-2.5 rounded-full bg-success/50" />
          </div>
          <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
            {[
              { label: t("landing.hero.tileAvailable"), value: "128", delta: "+4.2%" },
              { label: t("landing.hero.tileCollections"), value: "PKR 42.6M", delta: "+12.8%" },
              { label: t("landing.hero.tilePending"), value: "PKR 6.1M", delta: "-3.1%" },
              { label: t("landing.hero.tileDeals"), value: "37", delta: "+7.5%" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border/60 bg-background p-4 text-start">
                <p className="text-[11px] text-muted-foreground">{tile.label}</p>
                <p className="mt-1 font-heading text-xl font-semibold" dir="ltr">{tile.value}</p>
                <span
                  className={cn(
                    "mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium",
                    tile.delta.startsWith("-") ? "text-destructive" : "text-success",
                  )}
                >
                  <ArrowUpRight className={cn("size-3", tile.delta.startsWith("-") && "rotate-90")} />
                  <bdi dir="ltr">{tile.delta}</bdi>
                </span>
              </div>
            ))}
            <div className="col-span-2 mt-1 h-40 overflow-hidden rounded-xl border border-border/60 bg-background md:col-span-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={heroChartData} margin={{ top: 14, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    fill="url(#heroFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

const MARQUEE_COUNT = 12;

function ModuleMarquee() {
  const t = useT();
  const MARQUEE_ITEMS = Array.from({ length: MARQUEE_COUNT }, (_, i) => t(`landing.marquee.${i + 1}`));
  return (
    <div className="relative overflow-hidden border-t border-border/60 bg-background py-5 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap hover:[animation-play-state:paused]">
        {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
          <span key={i} className="flex items-center gap-10 font-heading text-lg text-muted-foreground/70">
            {item}
            <span className="size-1.5 rotate-45 rounded-[2px] bg-gold" />
          </span>
        ))}
      </div>
    </div>
  );
}

function StatsStrip() {
  const t = useT();
  const stats = [
    { icon: Sparkles, value: "3", label: t("landing.stats.tiers"), count: 3 },
    { icon: ListChecks, value: "12+", label: t("landing.stats.modules"), count: 12, suffix: "+" },
    { icon: HandCoins, value: "PKR", label: t("landing.stats.currency") },
    { icon: Users2, value: "8", label: t("landing.stats.languages"), count: 8 },
  ];
  return (
    <section className="border-y border-border/60 bg-secondary/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-y divide-border/60 px-4 md:grid-cols-4 md:divide-y-0 md:divide-x md:px-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="group flex flex-col items-center gap-2 px-4 py-8 text-center transition-colors hover:bg-background/60"
          >
            <div className="flex size-9 items-center justify-center rounded-full bg-background text-primary shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md">
              <s.icon className="size-4" />
            </div>
            <p className="font-heading text-3xl font-semibold">
              {s.count ? <AnimatedNumber value={s.count} format={(n) => `${n}${s.suffix ?? ""}`} /> : s.value}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  const t = useT();
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          {t("landing.features.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {t("landing.features.sub")}
        </p>
      </div>
      <div className="mt-14 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
            }}
            className={cn(
              "spotlight group relative overflow-hidden rounded-xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-xl hover:shadow-primary/[0.08]",
              f.big && "lg:col-span-2",
            )}
          >
            <div className="absolute -end-8 -top-8 size-28 rounded-full bg-primary/5 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="size-5" />
              </div>
              <Badge variant="outline" className={cn("shrink-0 text-[10px] font-medium", TIER_CHIP[f.tier])}>
                {t(`plan.${f.tier}`)}
              </Badge>
            </div>
            <h3 className="relative mt-4 font-heading text-base font-semibold">{t(`landing.feature.${f.id}.title`)}</h3>
            <p className="relative mt-1.5 max-w-md text-sm text-muted-foreground">{t(`landing.feature.${f.id}.desc`)}</p>

            {f.id === "properties" && (
              <div className="relative mt-5 flex h-2 overflow-hidden rounded-full">
                <div className="h-full bg-[var(--chart-1)]" style={{ width: "60%" }} />
                <div className="h-full bg-[var(--gold)]" style={{ width: "15%" }} />
                <div className="h-full bg-[var(--chart-4)]" style={{ width: "25%" }} />
              </div>
            )}
            {f.id === "properties" && (
              <div className="relative mt-2 flex gap-4 text-[11px] text-muted-foreground">
                <span>{t("status.available")} 60%</span>
                <span>{t("status.reserved")} 15%</span>
                <span>{t("status.sold")} 25%</span>
              </div>
            )}

            {f.id === "plotmap" && (
              <div className="relative mt-5 grid grid-cols-6 gap-1.5">
                {PLOT_PREVIEW.map((status, idx) => (
                  <motion.span
                    key={idx}
                    className="aspect-square rounded-[3px]"
                    style={{ backgroundColor: PLOT_COLOR[status] }}
                    animate={{ opacity: [0.55, 1, 0.55] }}
                    transition={{ duration: 2.8, repeat: Infinity, delay: (idx % 6) * 0.2 + Math.floor(idx / 6) * 0.3 }}
                    whileHover={{ scale: 1.25 }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const t = useT();
  return (
    <section id="how-it-works" className="border-y border-border/60 bg-secondary/20 py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            {t("landing.how.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t("landing.how.sub")}
          </p>
        </div>
        <div className="relative mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="pointer-events-none absolute start-0 end-0 top-6 hidden h-px bg-border md:block">
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: "left" }}
              className="h-px w-full bg-gradient-to-r from-primary via-primary/60 to-transparent"
            />
          </div>
          {STEPS.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.12 }}
              className="group relative flex flex-col items-center text-center md:items-start md:text-start"
            >
              <div className="relative z-10 flex size-12 items-center justify-center rounded-full border-2 border-primary bg-background font-heading text-lg font-semibold text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                {i + 1}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <step.icon className="size-4 text-primary" />
                <h3 className="font-heading text-base font-semibold">{t(`landing.step.${i + 1}.title`)}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t(`landing.step.${i + 1}.desc`)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TIER_ICON: Record<string, typeof Building2> = {
  basic: Building2,
  moderate: Users2,
  premium: Crown,
};

function PricingSection() {
  const t = useT();
  const [annual, setAnnual] = React.useState(false);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          {t("landing.pricing.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {t("landing.pricing.sub")}
        </p>
        <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
          <span className={cn("text-sm", !annual && "font-medium text-foreground", annual && "text-muted-foreground")}>
            {t("landing.pricing.monthly")}
          </span>
          <Switch checked={annual} onCheckedChange={setAnnual} aria-label={t("landing.pricing.toggleAria")} />
          <span className={cn("text-sm", annual && "font-medium text-foreground", !annual && "text-muted-foreground")}>
            {t("landing.pricing.annual")}
          </span>
          <Badge className="bg-gold/15 text-gold border-gold/30" variant="outline">
            {t("landing.pricing.twoMonthsFree")}
          </Badge>
        </div>
      </div>
      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PRICING.map((tier, i) => {
          const monthlyEquivalent = annual ? Math.round((tier.priceMonthlyPkr * 10) / 12) : tier.priceMonthlyPkr;
          const Icon = TIER_ICON[tier.id];
          return (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className={cn(
                "relative isolate flex flex-col rounded-2xl border p-7 transition-transform duration-300",
                tier.highlight
                  ? "border-primary/50 bg-card shadow-xl shadow-primary/15 md:-translate-y-3 md:scale-[1.02]"
                  : "border-border/70 bg-card hover:-translate-y-1 hover:shadow-md",
              )}
            >
              {tier.highlight && <PlotGridMotif className="rounded-2xl opacity-60" />}
              {tier.highlight && (
                <span className="absolute -top-3 start-7 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-sm">
                  {t("landing.pricing.mostPopular")}
                </span>
              )}
              <div className="relative flex items-center justify-between">
                <h3 className="font-heading text-lg font-semibold">{t(`plan.${tier.id}`)}</h3>
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg",
                    tier.id === "premium" ? "bg-gold/15 text-gold" : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-4.5" />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t(`pricing.${tier.id}.tagline`)}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-heading text-3xl font-semibold">
                  <AnimatedNumber value={monthlyEquivalent} format={(n) => formatPkr(n)} />
                </span>
                <span className="text-sm text-muted-foreground">{t("landing.pricing.perMonth")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {annual ? t("landing.pricing.billedAnnually") : t(`pricing.${tier.id}.seats`, { count: tier.seats.replace(/\D/g, "") })}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((f, fi) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-foreground/85">{t(`pricing.${tier.id}.f${fi + 1}`)}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-7"
                variant={tier.highlight ? "default" : "outline"}
                asChild
              >
                <Link href="/dashboard">{t("landing.pricing.getStarted")}</Link>
              </Button>
            </motion.div>
          );
        })}
      </div>
      <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border/70 bg-card/60 p-5 text-center">
        <p className="font-heading text-lg font-semibold">{t("landing.pricing.moreUsers")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("landing.pricing.moreUsersSub")}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {SEAT_PACKS.map((p) => (
            <span key={p.seats} className="rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-sm">
              <span className="font-semibold">{t("landing.pricing.seatPack", { seats: p.seats })}</span> · {t("landing.pricing.seatPrice", { price: formatPkr(p.priceMonthlyPkr) })}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBanner() {
  const t = useT();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
      <div className="surface-hero sheen relative isolate overflow-hidden rounded-3xl px-8 py-16 text-primary-foreground shadow-2xl shadow-primary/25">
        <div className="pointer-events-none absolute -start-10 bottom-0 size-64 animate-aurora rounded-full bg-[oklch(0.55_0.12_165/0.4)] blur-3xl" />
        <PlotGridMotif variant="inverted" className="opacity-70" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(white 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="pointer-events-none absolute -end-10 -top-16 size-56 rounded-full bg-gold/25 blur-3xl" />
        <div className="relative flex flex-col items-center gap-5 text-center md:flex-row md:justify-between md:text-start">
          <div>
            <h3 className="font-heading text-3xl font-semibold md:text-4xl"><Emph text={t("landing.cta.title")} className="text-gradient-gold italic rtl:not-italic" /></h3>
            <p className="mt-1.5 text-primary-foreground/80">
              {t("landing.cta.sub")}
            </p>
          </div>
          <Button size="lg" className="h-11 bg-gold px-6 text-gold-foreground shadow-lg shadow-gold/30 transition-transform hover:-translate-y-0.5 hover:bg-gold/90" asChild>
            <Link href="/dashboard">
              {t("landing.cta.button")}
              <ArrowRight className="size-4 rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  const t = useT();
  const columns = [
    {
      title: t("landing.footer.product"),
      links: [
        { label: t("landing.nav.features"), href: "#features" },
        { label: t("landing.nav.how"), href: "#how-it-works" },
        { label: t("landing.nav.pricing"), href: "#pricing" },
      ],
    },
    {
      title: t("landing.footer.explore"),
      links: [
        { label: t("landing.footer.demo"), href: "/dashboard" },
        { label: t("landing.footer.billing"), href: "/dashboard/settings/billing" },
      ],
    },
  ];

  return (
    <footer className="relative pt-16">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-10 sm:grid-cols-2 md:grid-cols-4 md:px-6">
        <div className="sm:col-span-2 md:col-span-2">
          <Link href="/" className="flex items-center gap-2">
            <Logomark />
            <span className="font-heading text-[15px] font-semibold">{APP_NAME}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{t("landing.footer.tagline")}</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/70">{col.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-foreground/70 transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground md:flex-row md:px-6">
          <span>{t("landing.footer.copyright", { name: APP_NAME })}</span>
          <span>{t("landing.footer.made")}</span>
        </div>
      </div>
    </footer>
  );
}
