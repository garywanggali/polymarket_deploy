"use client";

import { useEffect, useMemo, useState } from "react";

import { isWatched, toggleWatch } from "./watchlist";

export function WatchToggle(props: { slug: string }) {
  const slug = props.slug;
  const [watched, setWatched] = useState(false);

  const label = useMemo(() => (watched ? "已加入关注" : "加入关注"), [watched]);

  useEffect(() => {
    const sync = () => setWatched(isWatched(slug));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("pm_watchlist", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("pm_watchlist", sync);
    };
  }, [slug]);

  return (
    <button
      type="button"
      onClick={() => {
        toggleWatch(slug);
        setWatched(isWatched(slug));
      }}
      className={`pmButton ${watched ? "pmButtonPrimary" : "pmButtonGhost"}`}
      style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
      aria-pressed={watched}
    >
      {label}
    </button>
  );
}
