"use client";

import { useEffect, useRef, useState } from "react";

function useInView(margin: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: margin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin]);

  return { ref, visible };
}

export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, visible } = useInView("0px 0px -80px 0px");
  // The ref sits on an unclipped wrapper: `clip-path` on the observed
  // element itself reports zero intersection, so it would never reveal.
  return (
    <div ref={ref}>
      <div data-visible={visible} className={`reveal ${className}`}>
        {children}
      </div>
    </div>
  );
}

export function StaggerGrid({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, visible } = useInView("0px 0px -40px 0px");
  return (
    <div ref={ref} data-visible={visible} className={`stagger ${className}`}>
      {children}
    </div>
  );
}
