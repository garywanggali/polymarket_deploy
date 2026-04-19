"use client";

import { useState } from "react";

export function IngestButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={loading} className="pmButton pmButtonPrimary">
        {loading ? "抓取中..." : "更新最新盘口"}
      </button>
      {error ? <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
    </div>
  );
}
