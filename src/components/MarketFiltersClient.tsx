"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

type Props = {
  q: string;
  tag: string;
  sort: string;
  perPage: number;
  page: number;
  allTags: string[];
  classNameFilters: string;
  classNameField: string;
  classNameFilterAction: string;
};

export function MarketFiltersClient(props: Props) {
  const router = useRouter();
  const { q, tag, sort, perPage, page, allTags, classNameFilters, classNameField, classNameFilterAction } = props;

  const pageStr = useMemo(() => String(page), [page]);
  const perPageStr = useMemo(() => String(perPage), [perPage]);

  return (
    <form
      className={classNameFilters}
      onSubmit={(e) => {
        e.preventDefault();
        const y = window.scrollY;
        const fd = new FormData(e.currentTarget);
        const params = new URLSearchParams();

        const qv = String(fd.get("q") ?? "").trim();
        const tagv = String(fd.get("tag") ?? "").trim();
        const sortv = String(fd.get("sort") ?? "").trim();
        const ppv = String(fd.get("perPage") ?? "").trim();

        if (qv) params.set("q", qv);
        if (tagv) params.set("tag", tagv);
        if (sortv) params.set("sort", sortv);
        if (ppv) params.set("perPage", ppv);
        params.set("page", "1");

        const url = `/?${params.toString()}`;
        router.push(url, { scroll: false });
        requestAnimationFrame(() => window.scrollTo({ top: y }));
      }}
    >
      <label className={classNameField}>
        <span>搜索标题</span>
        <input name="q" defaultValue={q} placeholder="输入关键词" className="pmInput" />
      </label>
      <label className={classNameField}>
        <span>分类</span>
        <select name="tag" defaultValue={tag} className="pmSelect">
          <option value="">全部分类</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className={classNameField}>
        <span>排序</span>
        <select name="sort" defaultValue={sort} className="pmSelect">
          <option value="volume24hr">按 24h 成交</option>
          <option value="liquidity">按 流动性</option>
          <option value="endDate">按 截止时间</option>
        </select>
      </label>
      <label className={classNameField}>
        <span>每页数量</span>
        <select name="perPage" defaultValue={perPageStr} className="pmSelect">
          <option value="60">60</option>
          <option value="120">120</option>
          <option value="240">240</option>
        </select>
      </label>
      <input type="hidden" name="page" value={pageStr} />
      <div className={classNameFilterAction}>
        <button type="submit" className="pmButton pmButtonPrimary">
          应用筛选
        </button>
      </div>
    </form>
  );
}
