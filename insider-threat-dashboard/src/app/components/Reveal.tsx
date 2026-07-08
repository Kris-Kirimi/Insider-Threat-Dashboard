'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Box, BoxProps } from '@mui/material';

/**
 * Scroll-reveal wrapper: children fade and rise into place the first time they
 * enter the viewport. Uses IntersectionObserver (no scroll listeners) and
 * animates only transform/opacity. Honours prefers-reduced-motion.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 24,
  sx,
  ...rest
}: BoxProps & { delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : `translateY(${y}px)`,
        transition: `opacity 800ms cubic-bezier(0.32,0.72,0,1) ${delay}ms, transform 800ms cubic-bezier(0.32,0.72,0,1) ${delay}ms`,
        willChange: 'transform, opacity',
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
