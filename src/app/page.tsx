import Link from "next/link";

import styles from "./page.module.css";

import { IngestButton } from "@/components/IngestButton";
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

function toInt(v: string | string[] | undefined, fallback: number) {
  const s = typeof v === "string" ? v : "";
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getYesPrice(outcomes: { name: string; price: number | null }[]) {
  const yes = outcomes.find((o) => o.name.toLowerCase() === "yes");
  if (yes && typeof yes.price === "number") return yes.price;
  const first = outcomes.find((o) => typeof o.price === "number");
  return first?.price ?? null;
}

function pct(price: number | null) {
  if (price === null) return "-";
  return `${(price * 100).toFixed(1)}%`;
}

function trendLabel(move: number | null) {
  if (move === null) return "暂无趋势";
  if (move >= 0.03) return "快速升温";
  if (move > 0) return "偏热";
  if (move <= -0.03) return "快速降温";
  if (move < 0) return "偏冷";
  return "横盘";
}

function timeLeftHours(endDate: string | null) {
  if (!endDate) return null;
  const ms = Date.parse(endDate);
  if (!Number.isFinite(ms)) return null;
  return (ms - Date.now()) / (1000 * 60 * 60);
}

function beginnerHint(price: number | null, liquidity: number | null, move: number | null) {
  const trend = price === null ? "盘口还不够清晰" : price >= 0.7 ? "主方向明显偏 YES" : price <= 0.3 ? "主方向明显偏 NO" : "双方分歧较大";
  const heat = move === null ? "走势待观察" : move > 0 ? "最近热度在上升" : move < 0 ? "最近热度在回落" : "最近走势较平";
  const risk = liquidity === null ? "风险未知" : liquidity < 10000 ? "流动性偏薄，新手慎入" : liquidity < 50000 ? "流动性一般，注意滑点" : "流动性较好";
  return `${trend}，${heat}，${risk}。`;
}

export default async function Home(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const tag = typeof searchParams.tag === "string" ? searchParams.tag.trim() : "";
  const sort = typeof searchParams.sort === "string" ? searchParams.sort.trim() : "volume24hr";
  const ai = typeof searchParams.ai === "string" ? searchParams.ai.trim() === "1" : false;
  const perPage = Math.min(500, Math.max(20, toInt(searchParams.perPage, 60)));
  const page = Math.max(1, toInt(searchParams.page, 1));

  const index = await readMarketIndex();
  const snapshots = await readSnapshotLines({ maxLines: 20 });
  const allMarkets = index?.markets ?? [];
  const allTags = Array.from(new Set(allMarkets.flatMap((m) => m.tags))).sort();

  const marketBySlug = new Map(allMarkets.map((m) => [m.slug, m] as const));
  const lastSnap = snapshots.at(-1) ?? null;
  const prevSnap = snapshots.at(-2) ?? null;
  const prevMap = new Map((prevSnap?.markets ?? []).map((m) => [m.slug, m] as const));

  const eventConsistency = (() => {
    const movedThreshold = 0.005;
    const byEvent = new Map<
      string,
      { movedCount: number; sameDirCount: number; dominantDir: -1 | 0 | 1; ratio: number }
    >();

    for (const sm of lastSnap?.markets ?? []) {
      const pm = prevMap.get(sm.slug);
      if (!pm) continue;
      const meta = marketBySlug.get(sm.slug) ?? null;
      const eventSlug = meta?.eventSlug ?? `market:${sm.slug}`;
      const p1 = getYesPrice(sm.outcomes);
      const p0 = getYesPrice(pm.outcomes);
      if (p1 === null || p0 === null) continue;
      const d = p1 - p0;
      if (Math.abs(d) < movedThreshold) continue;

      const prev = byEvent.get(eventSlug);
      if (!prev) {
        byEvent.set(eventSlug, { movedCount: 1, sameDirCount: 1, dominantDir: d > 0 ? 1 : -1, ratio: 1 });
      } else {
        const dominantDir = prev.dominantDir;
        const dir: -1 | 1 = d > 0 ? 1 : -1;
        const movedCount = prev.movedCount + 1;
        const sameDirCount = prev.sameDirCount + (dir === dominantDir ? 1 : 0);
        const ratio = movedCount > 0 ? sameDirCount / movedCount : 0;
        byEvent.set(eventSlug, { movedCount, sameDirCount, dominantDir, ratio });
      }
    }

    return byEvent;
  })();

  const radarRows = (lastSnap?.markets ?? [])
    .map((m) => {
      const full = marketBySlug.get(m.slug);
      const prev = prevMap.get(m.slug);
      const price = getYesPrice(m.outcomes);
      const prevPrice = prev ? getYesPrice(prev.outcomes) : null;
      const move = price !== null && prevPrice !== null ? price - prevPrice : null;
      return {
        slug: m.slug,
        title: full?.title ?? m.slug,
        eventSlug: full?.eventSlug ?? null,
        endDate: full?.endDate ?? null,
        signals: full?.signals ?? [],
        price,
        move,
        liquidity: m.liquidity ?? full?.liquidity ?? null,
        volume24hr: m.volume24hr ?? full?.volume24hr ?? null,
      };
    })
    .filter((m) => Math.abs(m.move ?? 0) >= 0.01)
    .sort((a, b) => Math.abs(b.move ?? 0) - Math.abs(a.move ?? 0))
    .slice(0, 6);

  const deepseekKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").trim().replace(/\/+$/, "");
  const deepseekTimeoutMs = Math.min(120_000, Math.max(10_000, toInt(process.env.DEEPSEEK_TIMEOUT_MS, 45_000)));
  const deepseekRetries = Math.min(2, Math.max(0, toInt(process.env.DEEPSEEK_RETRIES, 1)));

  const runAi = async () => {
    if (!ai) return null;
    if (!deepseekKey) {
      return "未检测到 DEEPSEEK_API_KEY。请在 .env.local 配置后重启 dev server。";
    }
    if (radarRows.length === 0) {
      return "当前没有足够的异动样本可分析。请先抓取至少两次盘口，或等待市场有更多波动。";
    }

    const payload = {
      snapshot: {
        prev: prevSnap?.t ?? null,
        last: lastSnap?.t ?? null,
      },
      movers: radarRows.map((m) => ({
        slug: m.slug,
        title: m.title,
        yesPrice: m.price === null ? null : Number(m.price.toFixed(4)),
        move: m.move === null ? null : Number(m.move.toFixed(4)),
        liquidity: m.liquidity === null ? null : Number(m.liquidity.toFixed(2)),
        volume24hr: m.volume24hr === null ? null : Number(m.volume24hr.toFixed(2)),
        trend: trendLabel(m.move),
      })),
    };

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let attempt = 0; attempt <= deepseekRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), deepseekTimeoutMs);
      try {
        const res = await fetch(`${deepseekBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
            temperature: 0.25,
            max_tokens: 900,
            messages: [
              {
                role: "system",
                content:
                  "你是预测市场助手。你必须只用简体中文输出，禁止使用英文句子。面向实盘用户，内容可执行，必须包含风险提示，并明确“不构成投资建议”。",
              },
              {
                role: "user",
                content: [
                  "请全程只用简体中文回复，不要英文。",
                  "请基于这组异动市场做推荐解读：",
                  "1) 按优先级给出 3-5 个最值得看的市场（写出原因）",
                  "2) 每个给一个观察/执行建议（如等回撤、看成交持续性、看截止时间）",
                  "3) 给出参数建议：如果想看到更多机会，最小|Δp|建议调到多少",
                  "4) 最后给出统一风险清单",
                  "",
                  "数据（JSON）：",
                  JSON.stringify(payload),
                ].join("\n"),
              },
            ],
          }),
          signal: controller.signal,
        });

        const rawText = await res.text();
        let raw: {
          choices?: { message?: { content?: string | null } | null; finish_reason?: string | null }[];
          error?: { message?: string } | string;
        } | null = null;
        if (rawText) {
          try {
            raw = JSON.parse(rawText) as {
              choices?: { message?: { content?: string | null } | null; finish_reason?: string | null }[];
              error?: { message?: string } | string;
            };
          } catch {
            raw = null;
          }
        }

        if (!res.ok) {
          const msg =
            typeof raw?.error === "string"
              ? raw.error
              : raw?.error && typeof raw.error === "object" && typeof raw.error.message === "string"
                ? raw.error.message
                : rawText.slice(0, 200) || `HTTP ${res.status}`;
          return `AI 调用失败：${msg}`;
        }

        const first = raw?.choices?.[0];
        const content = first?.message?.content;
        if (typeof content === "string" && content.trim()) return content.trim();

        if (rawText && /Authentication Fails|governor/i.test(rawText)) {
          return "AI 调用失败：鉴权被网关拒绝（Authentication Fails / governor）。请确认 DeepSeek Key 有效、未过期、未被风控，并重启服务后重试。";
        }

        if (!raw || !Array.isArray(raw.choices)) {
          return `AI 返回格式异常：${rawText.slice(0, 180) || "empty_response"}`;
        }

        const finishReason = first?.finish_reason ?? "unknown";
        return `AI 没有返回内容（finish_reason=${finishReason}）。请重试，或减少同时分析的市场数量。`;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        const cause = err as Error & { cause?: { code?: string; message?: string } };
        const isTimeout = err.name === "AbortError" || cause.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
        if (isTimeout && attempt < deepseekRetries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        if (isTimeout) {
          return [
            `AI 调用失败：请求超时（${Math.round(deepseekTimeoutMs / 1000)}s，已重试 ${deepseekRetries} 次）。`,
            `当前接口：${deepseekBaseUrl}`,
            "请稍后重试，或配置可用代理 DEEPSEEK_BASE_URL（例如 https://<your-proxy>/v1）。",
          ].join("\n");
        }
        return `AI 调用失败：${cause.cause?.message ?? err.message}`;
      } finally {
        clearTimeout(timeout);
      }
    }
    return "AI 调用失败：未知网络错误。";
  };

  const aiText = await runAi();

  let markets = allMarkets;
  if (q) markets = markets.filter((m) => m.title.toLowerCase().includes(q.toLowerCase()));
  if (tag) markets = markets.filter((m) => m.tags.includes(tag));
  if (sort === "liquidity") markets = [...markets].sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
  else if (sort === "endDate") {
    markets = [...markets].sort((a, b) => {
      const ams = a.endDate ? Date.parse(a.endDate) : Number.POSITIVE_INFINITY;
      const bms = b.endDate ? Date.parse(b.endDate) : Number.POSITIVE_INFINITY;
      return ams - bms;
    });
  } else {
    markets = [...markets].sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0));
  }

  const total = markets.length;
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, maxPage);
  const offset = (safePage - 1) * perPage;
  const pageMarkets = markets.slice(offset, offset + perPage);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={`${styles.hero} pmCard`}>
          <div className={styles.heroAmbient} aria-hidden />
          <div className={styles.heroLeft}>
            <span className={`${styles.heroBadge} pmPill pmPillAccent`}>PREMIUM PREDICTION LOUNGE</span>
            <h1 className={styles.heroTitle}>金色盘口，实时异动，像贵宾厅一样做决策</h1>
            <p className={styles.heroDesc}>追踪全市场热度、流动性与价格波动。用更高信噪比的界面，快速锁定值得出手的机会。</p>
            <div className={styles.heroStats}>
              <div className={styles.stat}><span>更新时间</span><strong>{index?.updatedAt ? formatDate(index.updatedAt) : "暂无数据"}</strong></div>
              <div className={styles.stat}><span>市场总数</span><strong>{formatNumber(allMarkets.length)}</strong></div>
              <div className={styles.stat}><span>快照条数</span><strong>{formatNumber(snapshots.length)}</strong></div>
            </div>
            <div className={styles.heroCtaRow}>
              <Link href="#hot-movers" className={`pmButton pmButtonPrimary ${styles.heroCta}`}>
                立即查看异动机会
              </Link>
            </div>
          </div>
          <div className={styles.heroRight}>
            <IngestButton />
            <div className={styles.heroLinks}>
              <Link href="/watchlist" className="pmButton pmButtonGhost">我的关注</Link>
              <Link href="/geo" className="pmButton pmButtonGhost">世界地图</Link>
          </div>
            <div className={styles.tipBox}>
              <div><strong>蓝色 YES</strong>：市场更倾向会发生</div>
              <div><strong>红色 NO</strong>：市场更倾向不会发生</div>
              <div><strong>风险标签</strong>：按流动性分层，方便新手先避坑</div>
            </div>
          </div>
        </section>

        <section id="hot-movers" className={`${styles.section} pmCard`}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>先看热点变化</div>
              <h2 className={styles.sectionTitle}>最近动得最明显的市场</h2>
              <p className={styles.sectionDesc}>{lastSnap && prevSnap ? `对比 ${formatDate(prevSnap.t)} 和 ${formatDate(lastSnap.t)} 的变化。` : "至少抓取 2 次数据后，这里才会更有参考意义。"}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <form>
              <input type="hidden" name="q" value={q} />
              <input type="hidden" name="tag" value={tag} />
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="perPage" value={String(perPage)} />
              <input type="hidden" name="page" value={String(safePage)} />
              <button type="submit" name="ai" value="1" className="pmButton pmButtonPrimary">
                AI 推荐解读
              </button>
            </form>
            {ai ? (
              <Link
                href={`/?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&sort=${encodeURIComponent(sort)}&perPage=${perPage}&page=${safePage}`}
                className="pmButton pmButtonGhost"
              >
                清除 AI 结果
              </Link>
            ) : null}
          </div>
          {ai ? (
            <div className="pmCard" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>AI 推荐（DeepSeek）</div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{aiText ?? "AI 暂无输出。"}</div>
            </div>
          ) : null}
          <div className={styles.cardGrid}>
            {radarRows.length > 0 ? radarRows.map((m) => (
              <article key={m.slug} className={styles.marketCard}>
                <div className={styles.marketCardTop}>
                  <span className="pmPill pmPillAccent">近期异动</span>
                  <WatchToggle slug={m.slug} />
                </div>
                <Link href={`/market/${encodeURIComponent(m.slug)}`} className={styles.marketCardTitle}>{m.title}</Link>
                <p className={styles.marketCardDesc}>{beginnerHint(m.price, m.liquidity, m.move)}</p>
                <div className={styles.metricRow}>
                  <div className={styles.metric}><span>YES 概率</span><strong>{pct(m.price)}</strong></div>
                  <div className={styles.metric}><span>最近变化</span><strong className={(m.move ?? 0) < 0 ? styles.neg : styles.pos}>{m.move === null ? "-" : `${m.move > 0 ? "+" : ""}${m.move.toFixed(3)}`}</strong></div>
                  <div className={styles.metric}><span>24h 成交</span><strong>{formatNumber(m.volume24hr)}</strong></div>
                  <div className={styles.metric}><span>流动性</span><strong>{formatNumber(m.liquidity)}</strong></div>
                </div>
                <div className={styles.tagRow}>
                  {(() => {
                    const pills: { key: string; className: string; label: string }[] = [];
                    const ec =
                      m.eventSlug && eventConsistency.has(m.eventSlug) ? eventConsistency.get(m.eventSlug)! : null;
                    if (ec && ec.movedCount >= 2) {
                      pills.push({
                        key: "event",
                        className: ec.ratio >= 0.67 && ec.movedCount >= 3 ? "pmPill pmPillAccent" : "pmPill",
                        label: `事件一致性 ${ec.sameDirCount}/${ec.movedCount} 同向`,
                      });
                    }

                    const liq = m.liquidity ?? 0;
                    if (liq > 0) {
                      if (liq < 10_000) pills.push({ key: "liq", className: "pmPill pmPillDanger", label: "薄盘(<10k)" });
                      else if (liq < 50_000) pills.push({ key: "liq", className: "pmPill pmPillWarning", label: "一般(10k-50k)" });
                      else pills.push({ key: "liq", className: "pmPill pmPillSuccess", label: "较稳(>=50k)" });
                    }

                    const hoursLeft = timeLeftHours(m.endDate);
                    if (hoursLeft !== null && hoursLeft <= 72 && hoursLeft > -12) {
                      pills.push({ key: "end", className: "pmPill pmPillDanger", label: "临近截止(<72h)" });
                    }

                    if (m.price !== null && (m.price >= 0.9 || m.price <= 0.1)) {
                      pills.push({ key: "oneway", className: "pmPill pmPillDanger", label: "单边盘" });
                    }

                    for (const s of m.signals.slice(0, 2)) {
                      pills.push({ key: `sig:${s}`, className: "pmPill pmPillDanger", label: s });
                    }

                    return pills.slice(0, 5).map((p) => (
                      <span key={p.key} className={p.className}>
                        {p.label}
                      </span>
                    ));
                  })()}
                </div>
              </article>
            )) : <div className={styles.empty}>暂无异动数据。先更新两次盘口再来查看。</div>}
          </div>
        </section>

        <section className={`${styles.section} pmCard`}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>全市场筛选</div>
              <h2 className={styles.sectionTitle}>按你能理解的维度来挑</h2>
              <p className={styles.sectionDesc}>不知道看什么时，先按成交量、流动性、截止时间排序最直观。</p>
            </div>
        </div>
        <form className={styles.filters}>
            <label className={styles.field}><span>搜索标题</span><input name="q" defaultValue={q} placeholder="输入关键词" className="pmInput" /></label>
            <label className={styles.field}><span>分类</span><select name="tag" defaultValue={tag} className="pmSelect"><option value="">全部分类</option>{allTags.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label className={styles.field}><span>排序</span><select name="sort" defaultValue={sort} className="pmSelect"><option value="volume24hr">按 24h 成交</option><option value="liquidity">按 流动性</option><option value="endDate">按 截止时间</option></select></label>
            <label className={styles.field}><span>每页数量</span><select name="perPage" defaultValue={String(perPage)} className="pmSelect"><option value="60">60</option><option value="120">120</option><option value="240">240</option></select></label>
          <input type="hidden" name="page" value="1" />
            <div className={styles.filterAction}><button type="submit" className="pmButton pmButtonPrimary">应用筛选</button></div>
        </form>

          <div className={styles.cardGrid}>
            {pageMarkets.map((m) => {
              const yesPrice = getYesPrice(m.outcomes);
              return (
                <article key={m.slug} className={styles.marketCard}>
                  <div className={styles.marketCardTop}>
                    <span className="pmPill">{m.endDate ? `截止 ${formatDate(m.endDate)}` : "截止时间未知"}</span>
                    <WatchToggle slug={m.slug} />
                  </div>
                  <Link href={`/market/${encodeURIComponent(m.slug)}`} className={styles.marketCardTitle}>{m.title}</Link>
                  <p className={styles.marketCardDesc}>{beginnerHint(yesPrice, m.liquidity, null)}</p>
                  <div className={styles.metricRow}>
                    <div className={styles.metric}><span>YES 概率</span><strong>{pct(yesPrice)}</strong></div>
                    <div className={styles.metric}><span>24h 成交</span><strong>{formatNumber(m.volume24hr)}</strong></div>
                    <div className={styles.metric}><span>流动性</span><strong>{formatNumber(m.liquidity)}</strong></div>
                  </div>
                  <div className={styles.tagRow}>
                    {m.tags.slice(0, 4).map((t) => <span key={t} className="pmPill">{t}</span>)}
                    {m.signals.slice(0, 3).map((s) => <span key={s} className="pmPill pmPillDanger">{s}</span>)}
                  </div>
                </article>
              );
            })}
            {markets.length === 0 ? <div className={styles.empty}>暂无结果。先刷新数据或放宽筛选条件。</div> : null}
                    </div>

          {total > 0 ? (
            <div className={styles.pagination}>
              <Link href={`/?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&sort=${encodeURIComponent(sort)}&perPage=${perPage}&page=${Math.max(1, safePage - 1)}`} className={`pmButton pmButtonGhost ${safePage <= 1 ? styles.disabled : ""}`}>上一页</Link>
              <div className={styles.pageInfo}>第 {safePage} / {maxPage} 页 · 共 {formatNumber(total)} 条</div>
              <Link href={`/?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&sort=${encodeURIComponent(sort)}&perPage=${perPage}&page=${Math.min(maxPage, safePage + 1)}`} className={`pmButton pmButtonGhost ${safePage >= maxPage ? styles.disabled : ""}`}>下一页</Link>
                    </div>
              ) : null}
        </section>
      </main>
    </div>
  );
}
