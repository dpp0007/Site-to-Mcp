import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/** Scale = element width / design width, tracked with a ResizeObserver. */
export function useFit(designW: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0.4);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setS(el.clientWidth / designW);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designW]);
  return [ref, s] as const;
}

export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
