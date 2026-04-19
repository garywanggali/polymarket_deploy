"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CountryAgg } from "@/lib/geo";

type Metric = "total" | "sportsShare" | "politicsShare";

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function formatPercent(x: number) {
  if (!Number.isFinite(x)) return "-";
  return `${(x * 100).toFixed(1)}%`;
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function getFillColor(t: number) {
  const tt = clamp01(t);
  const lightness = 96 - tt * 44;
  return `hsl(210 75% ${lightness}%)`;
}

function stripToSvg(raw: string) {
  const idx = raw.indexOf("<svg");
  if (idx === -1) return "";
  return raw.slice(idx);
}

export function GeoMapClient(props: { countries: CountryAgg[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [svgLoadError, setSvgLoadError] = useState<string | null>(null);

  const [metric, setMetric] = useState<Metric>("total");
  const [selectedIso2, setSelectedIso2] = useState<string | null>(props.countries[0]?.iso2 ?? null);
  const [hovered, setHovered] = useState<{ iso2: string; x: number; y: number } | null>(null);

  const byIso2 = useMemo(() => new Map(props.countries.map((c) => [c.iso2, c])), [props.countries]);

  const metricStats = useMemo(() => {
    let max = 0;
    for (const c of props.countries) {
      const v =
        metric === "total"
          ? c.totalVolume24hr
          : metric === "sportsShare"
            ? c.categories.sports / (c.totalVolume24hr || 1)
            : c.categories.politics / (c.totalVolume24hr || 1);
      if (Number.isFinite(v)) max = Math.max(max, v);
    }
    return { max: max > 0 ? max : 1 };
  }, [metric, props.countries]);

  const selected = selectedIso2 ? byIso2.get(selectedIso2) ?? null : null;
  const selectedWithEmpty: CountryAgg | null =
    selectedIso2 === null
      ? null
      : selected ?? {
          iso2: selectedIso2,
          name: selectedIso2.toUpperCase(),
          totalVolume24hr: 0,
          categories: { sports: 0, politics: 0, crypto: 0, macro: 0, tech: 0, other: 0 },
        };
  const selectedHasData = Boolean(selected && selected.totalVolume24hr > 0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const res = await fetch(
        "https://raw.githubusercontent.com/flekschas/simple-world-map/a36dece5/world-map.svg",
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`Failed to fetch world map svg: ${res.status}`);
      const text = await res.text();
      setSvgLoadError(null);
      setSvg(stripToSvg(text));
    };
    load().catch((e: unknown) => {
      setSvgLoadError(e instanceof Error ? e.message : "地图资源加载失败");
      setSvg("");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!svg) return;
    el.innerHTML = svg;
  }, [svg]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const svgEl = el.querySelector("svg");
    if (!svgEl) return;

    svgEl.setAttribute("width", "100%");
    svgEl.setAttribute("height", "100%");
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const paths = Array.from(svgEl.querySelectorAll("path[id]")) as SVGPathElement[];

    for (const p of paths) {
      const iso2 = p.id.toLowerCase();
      const c = byIso2.get(iso2) ?? null;

      let v = 0;
      if (c) {
        v =
          metric === "total"
            ? c.totalVolume24hr
            : metric === "sportsShare"
              ? c.categories.sports / (c.totalVolume24hr || 1)
              : c.categories.politics / (c.totalVolume24hr || 1);
      }

      const t = clamp01(v / metricStats.max);
      p.style.fill = c ? getFillColor(t) : "hsl(0 0% 96%)";
      p.style.stroke = "hsl(0 0% 70%)";
      p.style.strokeWidth = "0.6";
      p.style.cursor = "pointer";
      p.style.transition = "fill 120ms ease";
      p.style.pointerEvents = "all";

      p.onpointerenter = (ev) => {
        const rect = svgEl.getBoundingClientRect();
        setHovered({ iso2, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
      };
      p.onpointermove = (ev) => {
        const rect = svgEl.getBoundingClientRect();
        setHovered({ iso2, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
      };
      p.onpointerleave = () => setHovered(null);
      p.onclick = () => setSelectedIso2(iso2);
    }

    return () => {
      for (const p of paths) {
        p.onpointerenter = null;
        p.onpointermove = null;
        p.onpointerleave = null;
        p.onclick = null;
      }
    };
  }, [byIso2, metric, metricStats.max, svg]);

  const tooltip = hovered ? byIso2.get(hovered.iso2) ?? null : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.9fr", gap: 16 }}>
      <div style={{ position: "relative", border: "1px solid hsl(0 0% 86%)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 12, padding: 12, borderBottom: "1px solid hsl(0 0% 90%)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            指标
            <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
              <option value="total">成交总量（24h 优先）</option>
              <option value="sportsShare">体育占比</option>
              <option value="politicsShare">政治占比</option>
            </select>
          </label>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "hsl(0 0% 35%)" }}>低</span>
            <div
              style={{
                width: 120,
                height: 10,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${getFillColor(0)} 0%, ${getFillColor(1)} 100%)`,
                border: "1px solid hsl(0 0% 86%)",
              }}
            />
            <span style={{ fontSize: 12, color: "hsl(0 0% 35%)" }}>高</span>
          </div>
        </div>

        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
          {!svg ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "hsl(0 0% 98%)",
                color: "hsl(0 0% 35%)",
                padding: 16,
                textAlign: "center",
              }}
            >
              {svgLoadError ? `地图加载失败：${svgLoadError}` : "地图加载中…"}
            </div>
          ) : null}
          {tooltip && hovered ? (
            <div
              style={{
                position: "absolute",
                left: hovered.x + 12,
                top: hovered.y + 12,
                background: "white",
                border: "1px solid hsl(0 0% 85%)",
                borderRadius: 10,
                padding: "8px 10px",
                boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
                pointerEvents: "none",
                minWidth: 180,
              }}
            >
              <div style={{ fontWeight: 600 }}>{tooltip.name}</div>
              <div style={{ fontSize: 12, color: "hsl(0 0% 35%)" }}>
                成交（24h 优先）：{formatNumber(tooltip.totalVolume24hr)}
              </div>
              <div style={{ fontSize: 12, color: "hsl(0 0% 35%)" }}>
                体育：{formatPercent(tooltip.categories.sports / (tooltip.totalVolume24hr || 1))} · 政治：
                {formatPercent(tooltip.categories.politics / (tooltip.totalVolume24hr || 1))}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ padding: 12, fontSize: 12, color: "hsl(0 0% 38%)" }}>
          说明：这里按“市场标题/描述出现的国家名”归属到国家，不代表交易者真实地理位置。
        </div>
      </div>

      <div style={{ border: "1px solid hsl(0 0% 86%)", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {selectedWithEmpty ? selectedWithEmpty.name : "选择一个国家"}
          </div>
          <div style={{ fontSize: 12, color: "hsl(0 0% 40%)" }}>
            {selectedWithEmpty ? selectedWithEmpty.iso2.toUpperCase() : ""}
          </div>
        </div>

        {selectedWithEmpty ? (
          <>
            <div style={{ marginTop: 10, fontSize: 13 }}>
              成交总量（24h 优先）：{formatNumber(selectedWithEmpty.totalVolume24hr)}
            </div>
            {!selectedHasData ? (
              <div style={{ marginTop: 8, fontSize: 13, color: "hsl(0 0% 40%)" }}>
                这个国家目前没有匹配到任何“包含国家名”的市场（或成交为 0）。
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr auto auto", gap: "8px 10px" }}>
              <div style={{ fontWeight: 600, color: "hsl(0 0% 35%)" }}>分类</div>
              <div style={{ fontWeight: 600, color: "hsl(0 0% 35%)", textAlign: "right" }}>成交</div>
              <div style={{ fontWeight: 600, color: "hsl(0 0% 35%)", textAlign: "right" }}>占比</div>

              {(
                [
                  ["体育", "sports"],
                  ["政治", "politics"],
                  ["加密", "crypto"],
                  ["宏观", "macro"],
                  ["科技", "tech"],
                  ["其他", "other"],
                ] as const
              ).map(([label, key]) => (
                <div key={key} style={{ display: "contents" }}>
                  <div>{label}</div>
                  <div style={{ textAlign: "right" }}>{formatNumber(selectedWithEmpty.categories[key])}</div>
                  <div style={{ textAlign: "right" }}>
                    {formatPercent(selectedWithEmpty.categories[key] / (selectedWithEmpty.totalVolume24hr || 1))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 12, fontSize: 13, color: "hsl(0 0% 40%)" }}>点击地图上的国家查看明细。</div>
        )}
      </div>
    </div>
  );
}
