import Link from "next/link";

import { GeoMapClient } from "@/components/GeoMapClient";
import { IngestButton } from "@/components/IngestButton";
import { aggregateMarketsByCountry } from "@/lib/geo";
import { readMarketIndex } from "@/lib/store";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

export default async function GeoPage() {
  const index = await readMarketIndex();
  const updatedAt = index?.updatedAt ?? null;

  if (!index || index.markets.length === 0) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>世界地图（按国家主题）</h1>
              <div className={styles.subTitle}>数据更新时间：{updatedAt ? formatDate(updatedAt) : "暂无数据（先抓取一次）"}</div>
            </div>
            <div className={styles.headerRight}>
              <Link href="/" className={styles.link}>
                返回首页
              </Link>
              <Link href="/watchlist" className={styles.link}>
                我的收藏
              </Link>
              <IngestButton />
            </div>
          </header>
          <div className={styles.empty}>暂无市场数据。先点击“立即抓取/刷新”。</div>
        </main>
      </div>
    );
  }

  const countries = await aggregateMarketsByCountry(index).catch(() => []);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>世界地图（按国家主题）</h1>
            <div className={styles.subTitle}>数据更新时间：{updatedAt ? formatDate(updatedAt) : "-"}</div>
          </div>
          <div className={styles.headerRight}>
            <Link href="/" className={styles.link}>
              返回首页
            </Link>
            <Link href="/watchlist" className={styles.link}>
              我的收藏
            </Link>
            <IngestButton />
          </div>
        </header>

        <GeoMapClient countries={countries} />
      </main>
    </div>
  );
}
