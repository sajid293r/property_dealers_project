"use client";

import * as React from "react";
import { useMotionValue, useTransform, animate, motion } from "framer-motion";

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = React.useState(format(0));
  const rounded = useTransform(motionValue, (latest) => format(Math.round(latest)));

  React.useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsubscribe = rounded.on("change", setDisplay);
    return () => {
      controls.stop();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <motion.span className={className} suppressHydrationWarning>
      {display}
    </motion.span>
  );
}
