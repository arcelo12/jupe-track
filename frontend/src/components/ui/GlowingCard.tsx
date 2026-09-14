import React from 'react';
import { motion } from 'framer-motion';

export function GlowingCard({ children, className = '', delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
      className={`relative rounded bg-surface-container border border-outline-variant overflow-hidden ${className}`}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
