"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { NormalizedMarket } from "@/lib/types";

import { readWatchlist } from "./watchlist";

type Item =
  | { slug: string; status: "loading" }
  | { slug: string; status: "ready"; market: NormalizedMarket }
  | { slug: string; status: "error"; error: string };

function formatNumber(n: number | null) {
  if (n === null) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function getYesPrice(outcomes: { name: string; price: number | null }[]) {
  const yes = outcomes.find((o) => o.name.toLowerCase() === "yes");
  if (yes && typeof yes.price === "number") return yes.price;
  const first = outcomes.find((o) => typeof o.price === "number");
  return first?.price ?? null;
}

export function WatchlistClient() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [alertMinMove, setAlertMinMove] = useState(0.01);
  const [alertMinLiq, setAlertMinLiq] = useState(10_000);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alerts, setAlerts] = useState<
    {
      slug: string;
      title: string;
      price: number | null;
      prevPrice: number | null;
      move: number | null;
      absMove: number | null;
      liquidity: number | null;
      volume24hr: number | null;
    }[]
  >([]);
  const [alertMeta, setAlertMeta] = useState<{ t: string | null; prevT: string | null; dtMinutes: number | null } | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSlugs(readWatchlist());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("pm_watchlist", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("pm_watchlist", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setItems(slugs.map((slug) => ({ slug, status: "loading" })));

    Promise.all(
      slugs.map(async (slug) => {
        try {
          const res = await fetch(`/api/markets/${encodeURIComponent(slug)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { market: NormalizedMarket };
          return { slug, status: "ready", market: json.market } as const;
        } catch (e) {
          return { slug, status: "error", error: e instanceof Error ? e.message : "未知错误" } as const;
        }
      }),
    ).then((results) => {
      if (!cancelled) setItems(results);
    });

    return () => {
      cancelled = true;
    };
  }, [slugs]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const run = async () => {
      if (slugs.length === 0) {
        if (!cancelled) {
          setAlerts([]);
          setAlertMeta(null);
          setAlertError(null);
        }
        return;
      }

      try {
        setAlertError(null);
        const res = await fetch(
          `/api/markets?withMoves=1&limit=500&slugs=${encodeURIComponent(slugs.join(","))}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          snapshot?: { t: string | null; prevT: string | null; dtMinutes: number | null };
          markets: (NormalizedMarket & {
            snapshot?: {
              t: string | null;
              prevT: string | null;
              dtMinutes: number | null;
              price: number | null;
              prevPrice: number | null;
              move: number | null;
              absMove: number | null;
              liquidity: number | null;
              volume24hr: number | null;
            };
          })[];
        };

        const nextAlerts = (json.markets ?? [])
          .map((m) => ({
            slug: m.slug,
            title: m.title,
            price: m.snapshot?.price ?? null,
            prevPrice: m.snapshot?.prevPrice ?? null,
            move: m.snapshot?.move ?? null,
            absMove: m.snapshot?.absMove ?? null,
            liquidity: m.snapshot?.liquidity ?? m.liquidity ?? null,
            volume24hr: m.snapshot?.volume24hr ?? m.volume24hr ?? null,
          }))
          .filter((a) => (a.liquidity ?? 0) >= alertMinLiq)
          .filter((a) => (a.absMove ?? 0) >= alertMinMove)
          .sort((a, b) => (b.absMove ?? 0) - (a.absMove ?? 0));

        if (!cancelled) {
          setAlerts(nextAlerts);
          setAlertMeta(json.snapshot ?? null);
        }
      } catch (e) {
        if (!cancelled) setAlertError(e instanceof Error ? e.message : "未知错误");
      }
    };

    run();
    if (autoRefresh) {
      timer = window.setInterval(run, 30_000);
    }
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [slugs, alertMinMove, alertMinLiq, autoRefresh]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px 56px" }}>
      <div className="pmCard" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              我的关注列表
            </div>
            <h1 style={{ marginTop: 8, fontSize: "clamp(28px, 4vw, 40px)", letterSpacing: "-0.04em" }}>把你想继续观察的市场集中放这里</h1>
            <p style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.7 }}>适合先收藏，再等新消息或价格变化后回来复盘。</p>
          </div>
          <Link href="/" className="pmButton pmButtonGhost">
            返回首页
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="pmCard" style={{ marginTop: 18, padding: 24, color: "var(--muted)", lineHeight: 1.7 }}>
          你还没有收藏任何市场。回到首页后，看到感兴趣的盘口可以点“加入关注”。
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="pmCard" style={{ marginTop: 18, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                异动提醒
              </div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>
                只看你关注的盘里，刚刚发生的明显变化
              </div>
              <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.7 }}>
                {alertMeta?.prevT && alertMeta?.t
                  ? `对比 ${alertMeta.prevT} → ${alertMeta.t}（约 ${alertMeta.dtMinutes ? alertMeta.dtMinutes.toFixed(1) : "-"} 分钟）`
                  : "需要至少两条快照才能计算异动。"}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>最小 |Δp|</span>
                <input
                  className="pmInput"
                  type="number"
                  step={0.001}
                  min={0}
                  max={0.5}
                  value={String(alertMinMove)}
                  onChange={(e) => setAlertMinMove(Number.parseFloat(e.target.value || "0"))}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>最小流动性</span>
                <input
                  className="pmInput"
                  type="number"
                  step={1000}
                  min={0}
                  value={String(alertMinLiq)}
                  onChange={(e) => setAlertMinLiq(Number.parseInt(e.target.value || "0", 10))}
                />
              </label>
              <button
                type="button"
                className={`pmButton ${autoRefresh ? "pmButtonPrimary" : "pmButtonGhost"}`}
                onClick={() => setAutoRefresh((v) => !v)}
              >
                {autoRefresh ? "自动刷新: 开" : "自动刷新: 关"}
              </button>
            </div>
          </div>

          {alertError ? <div style={{ marginTop: 12, color: "var(--danger)" }}>加载失败：{alertError}</div> : null}
          {alertMeta && (alertMeta.t === null || alertMeta.prevT === null) ? (
            <div style={{ marginTop: 12, color: "var(--muted)" }}>先点“更新最新盘口”抓取两次，再回来刷新这里。</div>
          ) : null}

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {alerts.length > 0 ? (
              alerts.slice(0, 12).map((a) => (
                <div key={a.slug} className="pmCard" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <span className="pmPill pmPillAccent">异动</span>
                    <span className="pmPill">
                      |Δp| {a.absMove === null ? "-" : a.absMove.toFixed(3)} {a.move !== null ? (a.move >= 0 ? "↑" : "↓") : ""}
                    </span>
                  </div>
                  <Link href={`/market/${encodeURIComponent(a.slug)}`} style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.35 }}>
                    {a.title}
                  </Link>
                  <div style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 13 }}>
                    p: {a.price === null ? "-" : a.price.toFixed(3)} · 流动性: {formatNumber(a.liquidity)} · 24h 成交: {formatNumber(a.volume24hr)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>
                暂无提醒结果。可以尝试降低“最小 |Δp|”或“最小流动性”，或等待更多快照产生差异。
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {items.map((it) => {
          if (it.status === "loading") {
            return (
              <div key={it.slug} className="pmCard" style={{ padding: 18 }}>
                正在加载：{it.slug}
              </div>
            );
          }

          if (it.status === "error") {
            return (
              <div key={it.slug} className="pmCard" style={{ padding: 18, color: "var(--danger)" }}>
                加载失败：{it.slug}（{it.error}）
              </div>
            );
          }

          const yesPrice = getYesPrice(it.market.outcomes);
          return (
            <div key={it.slug} className="pmCard" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <span className="pmPill">关注中</span>
                <span className="pmPill pmPillAccent">YES {yesPrice === null ? "-" : `${(yesPrice * 100).toFixed(1)}%`}</span>
              </div>
              <Link href={`/market/${encodeURIComponent(it.slug)}`} style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.4 }}>
                {it.market.title}
              </Link>
              <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>
                24h 成交：{formatNumber(it.market.volume24hr)} · 流动性：{formatNumber(it.market.liquidity)} · 截止：{it.market.endDate ?? "-"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {it.market.tags.slice(0, 4).map((t) => (
                  <span key={t} className="pmPill">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
