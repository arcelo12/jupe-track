import React from 'react';
import { motion } from 'framer-motion';

export function GlowingCard({ children, className = '', delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
      className={`relative rounded-2xl bg-[#0a0f1c]/60 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
