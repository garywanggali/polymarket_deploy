# PA! Web Scraping Data Service Project Report — Polymarket Opportunity Radar

Author: Gary Wang  
Date: 2026-04-20  

Live Deployment (Production): https://polymarketdeploy.vercel.app/  
GitHub Repository: https://github.com/garywanggali/polymarket_deploy  
Demo Video (3–5 min): （待补充）  

## 0. Executive Summary

本项目是一个“数据服务型”Web 应用：通过外部数据源（Polymarket Gamma API）获取全量市场信息，进行清洗与结构化、生成时间序列快照，并将其转化为可操作的决策界面：异动雷达、事件一致性、可交易性风险标签、关注列表提醒、单市场时间线与简易回测实验。

核心价值不在“展示一张市场列表”，而在于利用持续快照把“单点数据”升级为“变化数据”，让用户能更快发现有意义的价格变化，并用流动性/成交量等维度过滤噪声。

## 1. Problem Statement

预测市场具有如下典型信息不对称问题：

- 市场数量巨大，人工扫描无法及时捕捉早期异动。
- 很多“价格变化”并不具备可执行性（薄流动性、低成交确认、临近截止带来的剧烈波动）。
- 没有历史快照，无法计算 Δp、趋势确认、甚至做最小化的策略验证。

目标：构建一个可部署的数据服务 Web App，支持一键更新数据并形成时间序列快照，提供“更高信噪比”的筛选与解释工具。

## 2. Data Source & Collection

外部数据源：

- Polymarket Gamma API
  - Base URL: https://gamma-api.polymarket.com
  - Endpoint: `/events`

主要字段（用于业务计算与 UI）：

- 市场标识：`slug`, `title`, `eventSlug`
- 交易与风险：`liquidity`, `volume24hr`
- 价格：`outcomes[].price`
- 时间：`endDate`（临近截止风险提示）

拉取方式：

- 通过 API（而非 HTML 页面抓取）。
- 分页获取并在服务端聚合、去重、排序（按 24h 成交等）。

## 3. Compliance, Ethics & Safety

为了避免对外部数据源造成压力并保证合规性，本项目做了以下防护：

- 请求超时：使用 `AbortController` 为上游请求设置超时，避免悬挂连接。
- 安全重试：有限次数重试（默认 3 次），并使用指数退避+随机抖动，减少短时间突发请求。
- 任务可控：抓取由用户触发，且有上限控制（分页大小、最大事件数、最大运行时间）。
- 数据最小化：不采集个人隐私数据，仅存储公开的市场层数据用于分析展示。
- 密钥安全：外部 AI Key 等均通过环境变量配置，不写入仓库、不在客户端暴露。

## 4. System Architecture

技术栈：

- Next.js (App Router) + React + TypeScript
- API Routes 使用 Node.js runtime
- 部署平台：Vercel

数据流（从采集到展示）：

1) Ingest（采集与落库）

- 入口：点击 “更新最新盘口”
- API：`POST /api/ingest`
- 处理流程：
  - 分页拉取 Gamma `/events`
  - Normalize：事件 → 市场列表（结构统一）
  - Classify：生成标签/信号（风险、可交易性、临期等）
  - Persist：写入最新索引 + 追加一条快照（用于 Δp、趋势与简易回测）

2) Read（页面/接口读取）

- 首页、市场详情、地图页等：读取“最新索引 + 快照尾部”并做展示计算（如 Δp、事件一致性等）。
- API：`GET /api/markets`, `GET /api/markets/[slug]`

## 5. Persistence Strategy (Local vs Production)

本地开发：

- 默认使用 `.local-data/` 写入 `markets.json` 与 `snapshots.jsonl`。

线上部署（Vercel）：

- 由于 Vercel 运行环境本地文件系统是临时的（/tmp，实例重启/扩容会丢），线上改为写入 Redis 持久化：
  - 优先支持 KV REST 方式（`KV_REST_API_URL` + `KV_REST_API_TOKEN`）
  - 若仅有 `*_REDIS_URL`（redis:// 连接串），则使用 `node-redis` 直接连接

容量与成本控制（避免 Redis OOM）：

- 线上默认限制写入规模（可用环境变量覆盖）：
  - `INGEST_MAX_EVENTS`：最大抓取事件数（默认降低）
  - `INGEST_MAX_MARKETS`：索引最多保存的市场条数
  - `INGEST_SNAPSHOT_TOP_N`：每条快照最多保存的市场条数
  - `INGEST_MAX_MS`：采集最大运行时间
- 快照历史只保留最新一段（固定上限），避免 Redis 无限增长导致 OOM。

## 6. Key Features (Value-Added)

1) 异动雷达（Δp）

- 通过最近两次快照计算：
  - `Δp = p(last) - p(prev)`
  - 使用 `|Δp|` 排序，快速定位“变动明显”的市场

2) 事件一致性（Event Consistency）

- 将市场按 `eventSlug` 聚合，评估同一事件下多个盘口是否同向变化。
- 用于过滤单一薄盘噪声，提高信号质量。

3) 可交易性标签（Executability Labels）

- 流动性分层：提示薄盘滑点与操纵风险
- 临近截止提示：降低临期噪声误判
- 单边盘提示：避免追涨杀跌的低性价比交易

4) 关注列表与提醒（Watchlist + Alerts）

- 用户可对感兴趣市场进行订阅
- 只对订阅市场显示“异动提醒”，将产品从“仪表盘”升级为“雷达”

5) 市场详情页：时间序列与简易回测

- 显示快照时间线，帮助理解价格/成交/流动性变化
- 提供最小化回测实验（基于快照历史），用于快速验证信号阈值的合理性

6) 可选 AI 解读（DeepSeek）

- 在配置 `DEEPSEEK_API_KEY` 后，可对“异动市场集合”生成结构化解读（含风险提示）。
- 仅服务端调用，不在客户端暴露 Key。

## 7. Deployment (Vercel) Notes

- 推荐使用 Vercel 部署 Next.js（自动构建、自动部署）。
- 线上若启用 AI：
  - 在 Vercel 环境变量中配置 `DEEPSEEK_API_KEY`（以及可选的 base url / model 等）。
- 线上持久化：
  - 绑定 Redis/Upstash 并确保生产环境变量存在（`*_REDIS_URL` 或 KV REST 变量）。

## 8. Demo Checklist (3–5 min)

建议演示流程：

1) 打开首页，说明“信息过载 + 噪声过滤”问题。
2) 点击 “更新最新盘口”，展示数据更新（更新时间、市场数量等变化）。
3) 解释“异动雷达”：Δp + 流动性 + 成交确认 + 事件一致性。
4) 打开一个市场详情：看时间序列与对比信息。
5) 打开关注列表：展示只看“我关心的异动”。
6) （可选）打开地图页：展示聚合视图与钻取。
7) 总结局限与改进方向。

## 9. Limitations

- 信号强度依赖采集频率；快照稀疏会降低 Δp 与趋势判断价值。
- 交易成本模型是近似（基于流动性/成交），真实滑点需要订单簿深度数据。
- 外部数据源/API 可用性会影响 ingest 成功率（已做超时与有限重试）。
- Redis 免费额度有限，需要通过数据上限控制避免 OOM。

## 10. Future Work

- 引入更完整的持久化方案（更细粒度索引、长周期历史、查询优化）。
- 更稳健的异常检测与事件聚类（提升一致性判别与噪声过滤）。
- 更真实的执行成本估计（如果后续能获取深度/盘口）。
- 加入后台定时采集与更细的限流策略（适配公开访问）。

## Appendix A: Local Run

```bash
npm install
npm run dev
```

打开：https://polymarketdeploy.vercel.app/

## Appendix B: Export to PDF

用编辑器的 Markdown 导出 PDF 插件导出本文件，或在渲染页面中打印为 PDF。  
