export const MALE_REPORT_STYLES = [
  { value: "lu_xun", label: "鲁迅", description: "冷峻克制，偶尔反问" },
  { value: "lin_daiyu", label: "林黛玉", description: "委婉含酸，话里有话" },
  { value: "sun_wukong", label: "孙悟空", description: "直来直去，节奏明快" },
  { value: "gen_z", label: "张爱玲", description: "清醒犀利，善写细微反差" },
  { value: "standup_queen", label: "三毛", description: "洒脱温柔，带一点远方感" },
  { value: "news_anchor", label: "杨绛", description: "平静通透，克制而有分寸" },
  { value: "fashion_editor", label: "林徽因", description: "清醒雅致，观察有层次" },
  { value: "esports_caster", label: "萧红", description: "直白敏锐，带一点冷意" },
  { value: "teacher", label: "冰心", description: "温和细腻，语气清澈" },
  { value: "internet_bestie", label: "王熙凤", description: "八面玲珑，笑着把话说透" },
  { value: "cyber_support", label: "李清照", description: "婉约灵动，轻巧又有锋芒" },
  { value: "executive", label: "武则天", description: "果断强势，判断明确" },
] as const;

export type MaleReportStyle = typeof MALE_REPORT_STYLES[number]["value"];
export type MaleReportMode = "roast" | "praise";
