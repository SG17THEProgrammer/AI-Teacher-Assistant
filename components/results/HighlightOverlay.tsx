'use client';

import { motion } from 'framer-motion';
import type { BoundingBox } from '@/types/question';

export function HighlightOverlay({
  box,
  label,
  registerRef,
}: {
  box: BoundingBox;
  label: string;
  registerRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <motion.div
      ref={registerRef}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="highlight-region"
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
    >
      <span className="highlight-tab">{label}</span>
    </motion.div>
  );
}
