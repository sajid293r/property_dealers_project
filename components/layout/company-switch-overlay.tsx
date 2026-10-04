"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CompanyAvatar } from "@/components/company-avatar";
import { useCompany } from "@/lib/providers/company-provider";

/** Brief full-screen curtain that plays while the workspace swaps companies. */
export function CompanySwitchOverlay() {
  const { switching } = useCompany();
  return (
    <AnimatePresence>
      {switching && (
        <motion.div
          key={switching.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="surface-hero fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
          >
            <CompanyAvatar company={switching} className="size-20 rounded-3xl text-3xl" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-center"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-white/55">Opening workspace</p>
            <p className="mt-1 font-heading text-2xl font-semibold text-white">{switching.name}</p>
          </motion.div>
          <motion.div className="mt-2 h-[3px] w-40 overflow-hidden rounded-full bg-white/15">
            <motion.div
              className="h-full rounded-full bg-gold"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
