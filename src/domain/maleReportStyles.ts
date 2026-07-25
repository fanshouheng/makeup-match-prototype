export const MALE_REPORT_STYLES = [
  { value: "lu_xun", label: "鲁迅式冷讽", description: "克制、冷峻、带一点反问" },
  { value: "lin_daiyu", label: "林黛玉式含酸", description: "委婉、细腻、话里有话" },
  { value: "sun_wukong", label: "孙悟空式直评", description: "直接、泼辣、节奏明快" },
  { value: "internet_bestie", label: "毒舌闺蜜", description: "熟人语气，损完还能圆回来" },
  { value: "gen_z", label: "00 后嘴替", description: "网络感强，短句和梗更多" },
  { value: "executive", label: "冷面女总裁", description: "简洁、强势、判断明确" },
  { value: "fashion_editor", label: "时尚女编辑", description: "关注轮廓、镜头和视觉重点" },
  { value: "standup_queen", label: "脱口秀女王", description: "铺垫短，包袱落得快" },
  { value: "news_anchor", label: "新闻女主播", description: "一本正经地播报反差" },
  { value: "teacher", label: "严厉女班主任", description: "像点名一样逐项点评" },
  { value: "esports_caster", label: "电竞女解说", description: "节奏快，像在解说高光时刻" },
  { value: "cyber_support", label: "赛博女客服", description: "系统术语与机械幽默" },
] as const;

export type MaleReportStyle = typeof MALE_REPORT_STYLES[number]["value"];
export type MaleReportMode = "roast" | "praise";
