import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "./page.module.css";

import { WatchToggle } from "@/components/WatchToggle";
import { readMarketIndex, readSnapshotLines } from "@/lib/store";

function formatNumber(n: number | null) {
  if (n === null) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

function getYesPrice(outcomes: { name: string; price: number | null }[]) {
  const yes = outcomes.find((o) => o.name.toLowerCase() === "yes");
  if (yes && typeof yes.price === "number") return yes.price;
  const first = outcomes.find((o) => typeof o.price === "number");
  return first?.price ?? null;
}

function describePrice(price: number | null) {
  if (price === null) return "当前没有足够清晰的概率信号。";
  if (price >= 0.8) return "市场现在非常偏向“会发生”，但高赔率追价也要小心回撤。";
  if (price >= 0.6) return "市场整体偏向“会发生”，但还没到几乎没有分歧的程度。";
  if (price <= 0.2) return "市场现在非常偏向“不会发生”，除非你有强信息差，否则别轻易逆着来。";
  if (price <= 0.4) return "市场整体偏向“不会发生”，但仍然可能因为消息面快速反转。";
  return "市场分歧较大，适合先观察再决定，不适合凭感觉直接冲。";
}

function beginnerChecklist(liquidity: number | null, endDate: string | null) {
  const items: string[] = [];
  if (liquidity !== null && liquidity < 10000) items.push("流动性偏低，新手要特别小心滑点和假热度。 ");
  if (liquidity !== null && liquidity >= 10000) items.push("流动性尚可，价格参考价值相对更高。 ");
  if (endDate) {
    const diff = Date.parse(endDate) - Date.now();
    if (Number.isFinite(diff) && diff < 1000 * 60 * 60 * 24 * 3) items.push("离结算时间较近，价格可能变得很敏感。 ");
  }
  if (items.length === 0) items.push("先看规则描述，再看盘口深度，不要只凭标题下注。 ");
  return items.join("");
}

function formatSigned(n: number | null, digits: number) {
  if (n === null) return "-";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}`;
}

function toInt(v: string | string[] | undefined, fallback: number) {
  const s = typeof v === "string" ? v : "";
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(v: string | string[] | undefined, fallback: number) {
  const s = typeof v === "string" ? v : "";
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function sparkline(
  values: (number | null)[],
  size: { w: number; h: number; pad: number },
): { line: string; area: string; last: { x: number; y: number } | null; min: number; max: number } | null {
  const pts: { i: number; v: number }[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) pts.push({ i, v });
  }
  if (pts.length < 2) return null;

  let min = pts[0]!.v;
  let max = pts[0]!.v;
  for (const p of pts) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const span = Math.max(1e-9, max - min);

  const xOf = (i: number) => {
    const t = pts.length <= 1 ? 0 : i / (pts.length - 1);
    return size.pad + t * (size.w - size.pad * 2);
  };
  const yOf = (v: number) => {
    const t = (v - min) / span;
    return size.h - size.pad - t * (size.h - size.pad * 2);
  };

  const coords = pts.map((p, idx) => {
    const x = xOf(idx);
    const y = yOf(p.v);
    return { x, y };
  });

  const line = coords.map((c, idx) => `${idx === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const area = `${line} L${(size.w - size.pad).toFixed(2)},${(size.h - size.pad).toFixed(2)} L${size.pad.toFixed(2)},${(
    size.h - size.pad
  ).toFixed(2)} Z`;
  const last = coords.length > 0 ? coords[coords.length - 1]! : null;
  return { line, area, last, min, max };
}

export default async function MarketPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const index = await readMarketIndex();
  const market = index?.markets.find((m) => m.slug === slug) ?? null;
  if (!market) notFound();

  const metaBySlug = new Map((index?.markets ?? []).map((m) => [m.slug, m] as const));
  const yesPrice = getYesPrice(market.outcomes);
  const snapshots = await readSnapshotLines({ maxLines: 120 });
  const series = (() => {
    const out: {
      t: string;
      price: number | null;
      dPrice: number | null;
      volume24hr: number | null;
      dVolumePerHour: number | null;
      liquidity: number | null;
    }[] = [];

    let prevT: string | null = null;
    let prevPrice: number | null = null;
    let prevVol: number | null = null;
    for (const s of snapshots) {
      const sm = s.markets.find((x) => x.slug === slug) ?? null;
      if (!sm) continue;
      const price = getYesPrice(sm.outcomes);
      const volume24hr = sm.volume24hr ?? null;
      const liquidity = sm.liquidity ?? null;

      const dPrice = price !== null && prevPrice !== null ? price - prevPrice : null;
      let dVolumePerHour: number | null = null;
      if (volume24hr !== null && prevVol !== null) {
        if (prevT) {
          const dtHours = Math.max(1 / 60, (Date.parse(s.t) - Date.parse(prevT)) / (1000 * 60 * 60));
          dVolumePerHour = (volume24hr - prevVol) / dtHours;
        } else {
          dVolumePerHour = volume24hr - prevVol;
        }
      }

      out.push({ t: s.t, price, dPrice, volume24hr, dVolumePerHour, liquidity });
      prevT = s.t;
      prevPrice = price;
      prevVol = volume24hr;
    }
    return out;
  })();

  const btMovesRaw = typeof searchParams.btMoves === "string" ? searchParams.btMoves.trim() : "0.005,0.01,0.02";
  const btHoldsRaw = typeof searchParams.btHolds === "string" ? searchParams.btHolds.trim() : "1,2,5";
  const btMinLiq = Math.max(0, toInt(searchParams.btMinLiq, 0));
  const btMinQuality = Math.min(1, Math.max(0, toFloat(searchParams.btMinQuality, 0.35)));

  const btMoves = btMovesRaw
    .split(",")
    .map((s) => Number.parseFloat(s.trim()))
    .filter((x) => Number.isFinite(x) && x > 0 && x < 0.5)
    .slice(0, 10);

  const btHolds = btHoldsRaw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((x) => Number.isFinite(x) && x >= 1 && x <= 20)
    .slice(0, 10);

  const eventSlug = market.eventSlug ?? null;
  const eventSlugs =
    eventSlug === null ? [] : (index?.markets ?? []).filter((m) => (m.eventSlug ?? null) === eventSlug).map((m) => m.slug);
  const eventSlugSet = new Set(eventSlugs);

  const eventConsistencyByTime = (() => {
    if (!eventSlug || snapshots.length < 2) return new Map<string, { movedCount: number; ratio: number; dominantDir: -1 | 0 | 1 }>();
    const movedThreshold = 0.005;
    const out = new Map<string, { movedCount: number; ratio: number; dominantDir: -1 | 0 | 1 }>();
    for (let i = 1; i < snapshots.length; i += 1) {
      const prev = snapshots[i - 1]!;
      const cur = snapshots[i]!;
      const prevMap = new Map(prev.markets.map((m) => [m.slug, m] as const));
      let movedCount = 0;
      let sum = 0;
      for (const sm of cur.markets) {
        if (!eventSlugSet.has(sm.slug)) continue;
        const pm = prevMap.get(sm.slug);
        if (!pm) continue;
        const p1 = getYesPrice(sm.outcomes);
        const p0 = getYesPrice(pm.outcomes);
        if (p1 === null || p0 === null) continue;
        const d = p1 - p0;
        if (Math.abs(d) < movedThreshold) continue;
        movedCount += 1;
        sum += d;
      }
      if (movedCount < 2) continue;
      const dominantDir: -1 | 0 | 1 = sum > 0 ? 1 : sum < 0 ? -1 : 0;
      let sameDirCount = 0;
      if (dominantDir !== 0) {
        for (const sm of cur.markets) {
          if (!eventSlugSet.has(sm.slug)) continue;
          const pm = prevMap.get(sm.slug);
          if (!pm) continue;
          const p1 = getYesPrice(sm.outcomes);
          const p0 = getYesPrice(pm.outcomes);
          if (p1 === null || p0 === null) continue;
          const d = p1 - p0;
          if (Math.abs(d) < movedThreshold) continue;
          const dir: -1 | 1 = d > 0 ? 1 : -1;
          if (dir === dominantDir) sameDirCount += 1;
        }
      }
      const ratio = movedCount > 0 ? sameDirCount / movedCount : 0;
      out.set(cur.t, { movedCount, ratio, dominantDir });
    }
    return out;
  })();

  const qualityScore = (r: { liquidity: number | null; dVolumePerHour: number | null }, eventRatio: number | null) => {
    const liq = r.liquidity ?? 0;
    const liqTier = liq >= 200_000 ? 1 : liq >= 50_000 ? 0.8 : liq >= 10_000 ? 0.5 : liq > 0 ? 0.2 : 0;
    const v = Math.abs(r.dVolumePerHour ?? 0);
    const volScore = v <= 0 ? 0 : Math.min(1, Math.log10(v + 1) / 5);
    const ev = eventRatio ?? 0;
    const score = 0.5 * liqTier + 0.3 * volScore + 0.2 * ev;
    return Math.min(1, Math.max(0, score));
  };

  const seriesWithQuality = series.map((r) => {
    const ec = eventConsistencyByTime.get(r.t) ?? null;
    const eventRatio = ec ? ec.ratio : null;
    const quality = qualityScore(r, eventRatio);
    return { ...r, quality, eventRatio };
  });

  type BtRow = {
    moveMin: number;
    hold: number;
    trades: number;
    winRate: number;
    avgPnl: number;
    avgNetPnl: number;
    avgAbsMove: number;
    avgQuality: number;
  };

  const backtestRows: BtRow[] = (() => {
    if (seriesWithQuality.length < 4) return [];
    const moveMins = btMoves.length > 0 ? btMoves : [0.005, 0.01, 0.02];
    const holds = btHolds.length > 0 ? btHolds : [1, 2, 5];
    const rows: BtRow[] = [];

    const costPenalty = (liq: number | null) => {
      const L = liq ?? 0;
      const k = 20_000 / (L + 20_000);
      return 0.0012 * k;
    };

    for (const moveMin of moveMins) {
      for (const hold of holds) {
        let trades = 0;
        let wins = 0;
        let pnlSum = 0;
        let netSum = 0;
        let absMoveSum = 0;
        let qSum = 0;

        for (let i = 1; i < seriesWithQuality.length - hold; i++) {
          const now = seriesWithQuality[i];
          const next = seriesWithQuality[i + hold];
          if (!now || !next) continue;
          if (now.price === null || next.price === null) continue;
          if (now.dPrice === null) continue;
          if ((now.liquidity ?? 0) < btMinLiq) continue;
          if (now.quality < btMinQuality) continue;
          const absMove = Math.abs(now.dPrice);
          if (absMove < moveMin) continue;

          const pnl = now.dPrice > 0 ? now.price - next.price : next.price - now.price;
          const net = pnl - costPenalty(now.liquidity);
          trades += 1;
          pnlSum += pnl;
          netSum += net;
          absMoveSum += absMove;
          qSum += now.quality;
          if (net > 0) wins += 1;
        }

        rows.push({
          moveMin,
          hold,
          trades,
          winRate: trades > 0 ? wins / trades : 0,
          avgPnl: trades > 0 ? pnlSum / trades : 0,
          avgNetPnl: trades > 0 ? netSum / trades : 0,
          avgAbsMove: trades > 0 ? absMoveSum / trades : 0,
          avgQuality: trades > 0 ? qSum / trades : 0,
        });
      }
    }

    return rows;
  })();

  const eventPulse = (() => {
    if (!eventSlug) return null;
    if (snapshots.length < 2) return null;
    const prev = snapshots[snapshots.length - 2] ?? null;
    const last = snapshots[snapshots.length - 1] ?? null;
    if (!prev || !last) return null;

    const prevMap = new Map(prev.markets.map((m) => [m.slug, m] as const));
    const movedThreshold = 0.005;
    let movedCount = 0;
    let sum = 0;
    let sameDirCount = 0;
    let dominantDir: -1 | 0 | 1 = 0;

    for (const sm of last.markets) {
      const meta = metaBySlug.get(sm.slug) ?? null;
      if (!meta) continue;
      if ((meta.eventSlug ?? null) !== eventSlug) continue;
      const pm = prevMap.get(sm.slug);
      if (!pm) continue;
      const p1 = getYesPrice(sm.outcomes);
      const p0 = getYesPrice(pm.outcomes);
      if (p1 === null || p0 === null) continue;
      const d = p1 - p0;
      if (Math.abs(d) < movedThreshold) continue;
      movedCount += 1;
      sum += d;
    }

    if (movedCount >= 2) {
      dominantDir = sum > 0 ? 1 : sum < 0 ? -1 : 0;
      for (const sm of last.markets) {
        const meta = metaBySlug.get(sm.slug) ?? null;
        if (!meta) continue;
        if ((meta.eventSlug ?? null) !== eventSlug) continue;
        const pm = prevMap.get(sm.slug);
        if (!pm) continue;
        const p1 = getYesPrice(sm.outcomes);
        const p0 = getYesPrice(pm.outcomes);
        if (p1 === null || p0 === null) continue;
        const d = p1 - p0;
        if (Math.abs(d) < movedThreshold) continue;
        const dir: -1 | 1 = d > 0 ? 1 : -1;
        if (dir === dominantDir) sameDirCount += 1;
      }
    }

    return movedCount >= 2
      ? {
          movedCount,
          sameDirCount,
          dominantDir,
          label: `事件一致性 ${sameDirCount}/${movedCount} 同向（阈值 |Δp|≥${movedThreshold.toFixed(3)}）`,
        }
      : null;
  })();

  const priceSeries = seriesWithQuality.map((r) => r.price);
  const volSeries = seriesWithQuality.map((r) => r.volume24hr);
  const liqSeries = seriesWithQuality.map((r) => r.liquidity);
  const accelSeries = seriesWithQuality.map((r) => r.dVolumePerHour);
  const qualitySeries = seriesWithQuality.map((r) => r.quality);

  const eventPeers = (() => {
    if (!eventSlug || snapshots.length < 2) return [];
    const prev = snapshots[snapshots.length - 2] ?? null;
    const last = snapshots[snapshots.length - 1] ?? null;
    if (!prev || !last) return [];
    const prevMap = new Map(prev.markets.map((m) => [m.slug, m] as const));
    const peers: {
      slug: string;
      title: string;
      price: number | null;
      prevPrice: number | null;
      dPrice: number | null;
      absMove: number | null;
      liquidity: number | null;
      volAccel: number | null;
      quality: number;
    }[] = [];

    for (const sm of last.markets) {
      if (!eventSlugSet.has(sm.slug)) continue;
      const meta = metaBySlug.get(sm.slug) ?? null;
      if (!meta) continue;
      const pm = prevMap.get(sm.slug) ?? null;
      const p1 = getYesPrice(sm.outcomes);
      const p0 = pm ? getYesPrice(pm.outcomes) : null;
      const dPrice = p1 !== null && p0 !== null ? p1 - p0 : null;
      const absMove = dPrice === null ? null : Math.abs(dPrice);
      const liq = sm.liquidity ?? meta.liquidity ?? null;
      const v1 = sm.volume24hr ?? meta.volume24hr ?? null;
      const v0 = pm?.volume24hr ?? null;
      const dtHours =
        prev && last ? Math.max(1 / 60, (Date.parse(last.t) - Date.parse(prev.t)) / (1000 * 60 * 60)) : null;
      const volAccel = v1 !== null && v0 !== null ? (dtHours ? (v1 - v0) / dtHours : v1 - v0) : null;
      const ec = eventConsistencyByTime.get(last.t) ?? null;
      const q = qualityScore({ liquidity: liq, dVolumePerHour: volAccel }, ec ? ec.ratio : null);
      peers.push({
        slug: sm.slug,
        title: meta.title,
        price: p1,
        prevPrice: p0,
        dPrice,
        absMove,
        liquidity: liq,
        volAccel,
        quality: q,
      });
    }

    peers.sort((a, b) => (b.absMove ?? 0) - (a.absMove ?? 0));
    return peers.slice(0, 12);
  })();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={`${styles.hero} pmCard`}>
          <div className={styles.topRow}>
            <Link href="/" className="pmButton pmButtonGhost">
              返回首页
            </Link>
            <div className={styles.topActions}>
              <WatchToggle slug={market.slug} />
              <a
                className="pmButton pmButtonGhost"
                href={`https://polymarket.com/event/${encodeURIComponent(market.eventSlug ?? market.slug)}`}
                target="_blank"
                rel="noreferrer"
              >
                打开原始页面
              </a>
            </div>
          </div>

          <div className={styles.heroBody}>
            <div>
              <span className="pmPill pmPillAccent">新手解释视图</span>
              <h1 className={styles.title}>{market.title}</h1>
              <p className={styles.desc}>{describePrice(yesPrice)}</p>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}><span>YES 概率</span><strong>{yesPrice === null ? "-" : `${(yesPrice * 100).toFixed(1)}%`}</strong></div>
              <div className={styles.summaryCard}><span>24h 成交</span><strong>{formatNumber(market.volume24hr)}</strong></div>
              <div className={styles.summaryCard}><span>流动性</span><strong>{formatNumber(market.liquidity)}</strong></div>
              <div className={styles.summaryCard}><span>截止时间</span><strong>{market.endDate ? formatDate(market.endDate) : "-"}</strong></div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} pmCard`}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>先看懂再下注</div>
              <h2 className={styles.sectionTitle}>这场市场在表达什么</h2>
            </div>
          </div>
          <div className={styles.noteGrid}>
            <div className={styles.noteCard}>
              <strong>一句话理解</strong>
              <p>{describePrice(yesPrice)}</p>
            </div>
            <div className={styles.noteCard}>
              <strong>新手提示</strong>
              <p>{beginnerChecklist(market.liquidity, market.endDate)}</p>
            </div>
            <div className={styles.noteCard}>
              <strong>更新时间</strong>
              <p>{index?.updatedAt ? formatDate(index.updatedAt) : "-"}</p>
            </div>
          </div>
        </section>

        <section className={`${styles.section} pmCard`}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>爬虫价值</div>
              <h2 className={styles.sectionTitle}>快照时间线</h2>
              <div className={styles.desc}>
                {series.length >= 2
                  ? `覆盖 ${series.length} 条快照 · ${formatDate(series[0]?.t ?? null)} → ${formatDate(series[series.length - 1]?.t ?? null)}`
                  : "至少抓取 2 次数据后，才能看到时间线与异动解释。"}
              </div>
            </div>
          </div>

          {eventPulse ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <span className="pmPill pmPillAccent">{eventPulse.label}</span>
              {eventPulse.dominantDir !== 0 ? (
                <span className={`pmPill ${eventPulse.dominantDir > 0 ? "pmPillSuccess" : "pmPillDanger"}`}>
                  主方向：{eventPulse.dominantDir > 0 ? "同向上升" : "同向下降"}
                </span>
              ) : null}
              <span className="pmPill">
                质量分（最新）{seriesWithQuality.length > 0 ? seriesWithQuality[seriesWithQuality.length - 1]!.quality.toFixed(2) : "-"}
              </span>
            </div>
          ) : null}

          <div className={styles.noteGrid} style={{ marginBottom: 12 }}>
            {(() => {
              const w = 420;
              const h = 76;
              const pad = 8;
              const s1 = sparkline(priceSeries, { w, h, pad });
              const s2 = sparkline(volSeries, { w, h, pad });
              const s3 = sparkline(liqSeries, { w, h, pad });
              const s4 = sparkline(accelSeries, { w, h, pad });
              const s5 = sparkline(qualitySeries, { w, h, pad });

              const card = (
                title: string,
                lastText: string,
                rangeText: string,
                s: typeof s1,
                colors: { stroke: string; fill: string },
                id: string,
              ) => (
                <div className={styles.noteCard}>
                  <strong>{title}</strong>
                  <div className={styles.sparklineWrap}>
                    <div className={styles.sparklineMeta}>
                      <strong>{lastText}</strong>
                      <span>{rangeText}</span>
                    </div>
                    <svg className={styles.sparklineSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={colors.stroke} stopOpacity="0.55" />
                          <stop offset="50%" stopColor={colors.stroke} stopOpacity="1" />
                          <stop offset="100%" stopColor={colors.stroke} stopOpacity="0.55" />
                        </linearGradient>
                        <linearGradient id={`a-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={colors.fill} stopOpacity="0.35" />
                          <stop offset="100%" stopColor={colors.fill} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {s ? (
                        <>
                          <path d={s.area} fill={`url(#a-${id})`} />
                          <path d={s.line} fill="none" stroke={`url(#g-${id})`} strokeWidth="2.4" />
                          {s.last ? <circle cx={s.last.x} cy={s.last.y} r="3.4" fill={colors.stroke} /> : null}
                        </>
                      ) : (
                        <text x="10" y="42" fill="rgba(255,232,190,0.7)" fontSize="12">
                          快照不足
                        </text>
                      )}
                    </svg>
                  </div>
                </div>
              );

              const lastPrice = priceSeries.length > 0 ? priceSeries[priceSeries.length - 1] : null;
              const lastVol = volSeries.length > 0 ? volSeries[volSeries.length - 1] : null;
              const lastLiq = liqSeries.length > 0 ? liqSeries[liqSeries.length - 1] : null;
              const lastAccel = accelSeries.length > 0 ? accelSeries[accelSeries.length - 1] : null;
              const lastQ = qualitySeries.length > 0 ? qualitySeries[qualitySeries.length - 1] : null;

              return (
                <>
                  {card(
                    "YES 概率走势",
                    lastPrice === null ? "-" : `${(lastPrice * 100).toFixed(1)}%`,
                    s1 ? `区间 ${(s1.min * 100).toFixed(1)}%–${(s1.max * 100).toFixed(1)}%` : "区间 -",
                    s1,
                    { stroke: "rgb(243,182,80)", fill: "rgb(243,182,80)" },
                    `p-${slug}`,
                  )}
                  {card(
                    "24h 成交走势",
                    formatNumber(lastVol),
                    s2 ? `区间 ${formatNumber(s2.min)}–${formatNumber(s2.max)}` : "区间 -",
                    s2,
                    { stroke: "rgb(56,211,159)", fill: "rgb(56,211,159)" },
                    `v-${slug}`,
                  )}
                  {card(
                    "流动性走势",
                    formatNumber(lastLiq),
                    s3 ? `区间 ${formatNumber(s3.min)}–${formatNumber(s3.max)}` : "区间 -",
                    s3,
                    { stroke: "rgb(255,126,139)", fill: "rgb(255,126,139)" },
                    `l-${slug}`,
                  )}
                  {card(
                    "成交变化/小时",
                    lastAccel === null ? "-" : formatSigned(lastAccel, 0),
                    s4 ? `区间 ${formatNumber(s4.min)}–${formatNumber(s4.max)}` : "区间 -",
                    s4,
                    { stroke: "rgb(123,149,239)", fill: "rgb(123,149,239)" },
                    `a-${slug}`,
                  )}
                  {card(
                    "质量分（0-1）",
                    lastQ === null ? "-" : lastQ.toFixed(2),
                    s5 ? `区间 ${s5.min.toFixed(2)}–${s5.max.toFixed(2)}` : "区间 -",
                    s5,
                    { stroke: "rgb(255,215,135)", fill: "rgb(255,215,135)" },
                    `q-${slug}`,
                  )}
                </>
              );
            })()}
          </div>

          {eventPeers.length > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <div className={styles.desc} style={{ marginTop: 0 }}>
                同事件盘口对比（最近两条快照）：越多市场同向一起动，越像真消息；只动一个可能是噪音。
              </div>
              <div className={styles.tableWrap} style={{ marginTop: 10 }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>同事件市场</th>
                      <th style={{ textAlign: "right" }}>p</th>
                      <th style={{ textAlign: "right" }}>Δp</th>
                      <th style={{ textAlign: "right" }}>成交变化/小时</th>
                      <th style={{ textAlign: "right" }}>流动性</th>
                      <th style={{ textAlign: "right" }}>质量分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventPeers.map((p) => (
                      <tr key={p.slug}>
                        <td>
                          <Link href={`/market/${encodeURIComponent(p.slug)}`} style={{ fontWeight: 800 }}>
                            {p.title}
                          </Link>
                          <div className={styles.muted} style={{ marginTop: 4 }}>
                            {p.slug}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {p.price === null ? "-" : p.price.toFixed(3)}
                        </td>
                        <td style={{ textAlign: "right" }} className={p.dPrice === null ? styles.mono : p.dPrice >= 0 ? styles.pos : styles.neg}>
                          {p.dPrice === null ? "-" : formatSigned(p.dPrice, 3)}
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {p.volAccel === null ? "-" : formatSigned(p.volAccel, 0)}
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {formatNumber(p.liquidity)}
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {p.quality.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th style={{ textAlign: "right" }}>p(YES)</th>
                  <th style={{ textAlign: "right" }}>Δp</th>
                  <th style={{ textAlign: "right" }}>24h 成交</th>
                  <th style={{ textAlign: "right" }}>成交变化/小时</th>
                  <th style={{ textAlign: "right" }}>流动性</th>
                </tr>
              </thead>
              <tbody>
                {series.length > 0 ? (
                  series
                    .slice(Math.max(0, series.length - 30))
                    .reverse()
                    .map((r) => (
                      <tr key={r.t}>
                        <td className={styles.mono}>{formatDate(r.t)}</td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {r.price === null ? "-" : r.price.toFixed(3)}
                        </td>
                        <td style={{ textAlign: "right" }} className={r.dPrice === null ? styles.mono : r.dPrice >= 0 ? styles.pos : styles.neg}>
                          {r.dPrice === null ? "-" : `${r.dPrice > 0 ? "+" : ""}${r.dPrice.toFixed(3)}`}
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {formatNumber(r.volume24hr)}
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {r.dVolumePerHour === null ? "-" : `${r.dVolumePerHour > 0 ? "+" : ""}${r.dVolumePerHour.toFixed(0)}`}
                        </td>
                        <td style={{ textAlign: "right" }} className={styles.mono}>
                          {formatNumber(r.liquidity)}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.muted} style={{ padding: 12 }}>
                      暂无快照数据。请在首页点击“更新最新盘口”抓取两次后再回来。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${styles.section} pmCard`}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>实验室</div>
              <h2 className={styles.sectionTitle}>最小回测（均值回归）</h2>
              <div className={styles.desc}>
                规则：当某次快照出现 |Δp| ≥ 阈值，顺势反向做一笔（涨则做空，跌则做多），持有 N 个快照后平仓。净收益包含一个基于流动性的保守成本惩罚（不构成投资建议）。
              </div>
            </div>
          </div>

          <form style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
              <span className={styles.muted} style={{ fontSize: 12, fontWeight: 700 }}>
                回测阈值 |Δp|（逗号）
              </span>
              <input name="btMoves" defaultValue={btMovesRaw} className="pmInput" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
              <span className={styles.muted} style={{ fontSize: 12, fontWeight: 700 }}>
                持有快照数（逗号）
              </span>
              <input name="btHolds" defaultValue={btHoldsRaw} className="pmInput" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
              <span className={styles.muted} style={{ fontSize: 12, fontWeight: 700 }}>
                最小流动性
              </span>
              <input name="btMinLiq" defaultValue={String(btMinLiq)} className="pmInput" type="number" step={1000} min={0} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
              <span className={styles.muted} style={{ fontSize: 12, fontWeight: 700 }}>
                最小质量分(0-1)
              </span>
              <input
                name="btMinQuality"
                defaultValue={String(btMinQuality)}
                className="pmInput"
                type="number"
                step={0.05}
                min={0}
                max={1}
              />
            </label>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button type="submit" className="pmButton pmButtonPrimary">
                应用回测参数
              </button>
            </div>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: "right" }}>|Δp| ≥</th>
                  <th style={{ textAlign: "right" }}>持有(快照)</th>
                  <th style={{ textAlign: "right" }}>交易数</th>
                  <th style={{ textAlign: "right" }}>胜率(净)</th>
                  <th style={{ textAlign: "right" }}>均值收益</th>
                  <th style={{ textAlign: "right" }}>均值净收益</th>
                  <th style={{ textAlign: "right" }}>均值|move|</th>
                  <th style={{ textAlign: "right" }}>均值质量分</th>
                </tr>
              </thead>
              <tbody>
                {backtestRows.length > 0 ? (
                  backtestRows.map((r) => (
                    <tr key={`${r.moveMin}:${r.hold}`}>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {r.moveMin.toFixed(3)}
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {r.hold}
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {r.trades}
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {(r.winRate * 100).toFixed(1)}%
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {formatSigned(r.avgPnl, 4)}
                      </td>
                      <td style={{ textAlign: "right" }} className={r.avgNetPnl >= 0 ? styles.pos : styles.neg}>
                        {formatSigned(r.avgNetPnl, 4)}
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {r.avgAbsMove.toFixed(4)}
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {r.avgQuality.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className={styles.muted} style={{ padding: 12 }}>
                      快照不足，暂无回测结果。请先抓取更多次盘口再回来查看。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {market.outcomes.length > 0 ? (
          <section className={`${styles.section} pmCard`}>
            <div className={styles.sectionHead}>
              <div>
                <div className={styles.eyebrow}>盘口明细</div>
                <h2 className={styles.sectionTitle}>每个选项当前价格</h2>
              </div>
            </div>
            <div className={styles.outcomeList}>
              {market.outcomes.map((o) => (
                <div key={o.name} className={styles.outcomeCard}>
                  <div>
                    <div className={styles.outcomeName}>{o.name}</div>
                    <div className={styles.outcomeHint}>{o.price === null ? "暂无价格" : `对应隐含概率约 ${(o.price * 100).toFixed(1)}%`}</div>
                  </div>
                  <strong className={styles.outcomePrice}>{o.price === null ? "-" : o.price.toFixed(3)}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {market.description ? (
          <section className={`${styles.section} pmCard`}>
            <div className={styles.sectionHead}>
              <div>
                <div className={styles.eyebrow}>规则与描述</div>
                <h2 className={styles.sectionTitle}>这场盘到底怎么算输赢</h2>
              </div>
            </div>
            <div className={styles.longText}>{market.description}</div>
          </section>
        ) : null}

        <section className={`${styles.section} pmCard`}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>分类标签</div>
              <h2 className={styles.sectionTitle}>你可以怎样快速归类这场盘</h2>
            </div>
          </div>
          <div className={styles.tagWrap}>
            {market.tags.length > 0 ? market.tags.map((t) => <span key={t} className="pmPill">{t}</span>) : <span className={styles.muted}>暂无分类</span>}
          </div>
          <div className={styles.tagWrap}>
            {market.signals.length > 0 ? market.signals.map((s) => <span key={s} className="pmPill pmPillDanger">{s}</span>) : <span className={styles.muted}>暂无风险/信号提示</span>}
          </div>
        </section>
      </main>
    </div>
  );
}
