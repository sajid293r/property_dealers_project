"use client";

import * as React from "react";
import { useMotionValue, useTransform, animate, motion, useReducedMotion } from "framer-motion";

/**
 * Count-up number. The server (and any no-JS reader, link preview or crawler) gets the
 * FINAL value; the count-up replays from 0 only after the page has hydrated, so nobody
 * ever sees a false "Rs 0".
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) => format(Math.round(latest)));
  const mounted = React.useRef(false);

  React.useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      return;
    }
    // first run after hydration: replay from zero; later changes animate from where we are
    if (!mounted.current) {
      mounted.current = true;
      if (value !== 0) motionValue.jump(0);
    }
    const controls = animate(motionValue, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, reduce, motionValue]);

  return (
    <motion.span className={className} suppressHydrationWarning>
      {rounded}
    </motion.span>
  );
}
