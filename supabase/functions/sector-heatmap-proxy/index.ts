// S&P500 섹터 히트맵용 프록시. GICS 11개 섹터를 대표하는 대형주(섹터당 6종목)의 실시간(또는 장 마감이면
// 전일 종가 기준) 등락률을 야후 파이낸스에서 가져온다. 브라우저에서 직접 호출하면 CORS로 막히기 때문에
// 서버 경유가 필요하다.
//
// 시세/등락률: v8/finance/chart (크럼/로그인 없이 접근 가능, 이 프로젝트의 다른 프록시들과 동일한 방식)
// 시가총액: 야후의 v7/finance/quote·quoteSummary는 현재 크럼(로그인 세션) 없이는 401을 반환해 서버에서
//   실시간으로 가져올 수 없다. 대신 섹터 매핑과 함께 대략적인 시가총액(십억 달러 단위, 주기적으로 갱신
//   필요)을 함께 보관해 타일에 함께 표기한다 - 가격/등락률만 완전히 실시간이다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 섹터(key) → 한글 라벨 + 대표 종목(티커: [표기용 이름, 대략적 시가총액(십억 달러)]). 섹터당 6종목, 총 66종목.
const SECTORS: { key: string; label: string; stocks: Record<string, [string, number]> }[] = [
  { key: "technology", label: "기술", stocks: {
    AAPL: ["Apple", 3400], MSFT: ["Microsoft", 3100], NVDA: ["NVIDIA", 3300], AVGO: ["Broadcom", 1400], ORCL: ["Oracle", 550], CRM: ["Salesforce", 260],
  } },
  { key: "communication", label: "커뮤니케이션", stocks: {
    GOOGL: ["Alphabet", 2200], META: ["Meta Platforms", 1600], NFLX: ["Netflix", 420], DIS: ["Disney", 210], CMCSA: ["Comcast", 130], TMUS: ["T-Mobile", 260],
  } },
  { key: "consumer_discretionary", label: "임의소비재", stocks: {
    AMZN: ["Amazon", 2300], TSLA: ["Tesla", 1100], HD: ["Home Depot", 370], MCD: ["McDonald's", 210], NKE: ["Nike", 100], SBUX: ["Starbucks", 90],
  } },
  { key: "consumer_staples", label: "필수소비재", stocks: {
    PG: ["Procter & Gamble", 380], KO: ["Coca-Cola", 300], PEP: ["PepsiCo", 200], WMT: ["Walmart", 780], COST: ["Costco", 430], PM: ["Philip Morris", 260],
  } },
  { key: "healthcare", label: "헬스케어", stocks: {
    LLY: ["Eli Lilly", 750], UNH: ["UnitedHealth", 280], JNJ: ["Johnson & Johnson", 380], ABBV: ["AbbVie", 350], MRK: ["Merck", 250], PFE: ["Pfizer", 140],
  } },
  { key: "financials", label: "금융", stocks: {
    "BRK-B": ["Berkshire Hathaway", 1000], JPM: ["JPMorgan Chase", 750], V: ["Visa", 650], MA: ["Mastercard", 500], BAC: ["Bank of America", 330], WFC: ["Wells Fargo", 260],
  } },
  { key: "industrials", label: "산업재", stocks: {
    GE: ["GE Aerospace", 250], CAT: ["Caterpillar", 190], UNP: ["Union Pacific", 130], HON: ["Honeywell", 140], RTX: ["RTX", 190], BA: ["Boeing", 140],
  } },
  { key: "energy", label: "에너지", stocks: {
    XOM: ["Exxon Mobil", 500], CVX: ["Chevron", 280], COP: ["ConocoPhillips", 130], SLB: ["SLB", 60], EOG: ["EOG Resources", 70], MPC: ["Marathon Petroleum", 50],
  } },
  { key: "utilities", label: "유틸리티", stocks: {
    NEE: ["NextEra Energy", 150], DUK: ["Duke Energy", 90], SO: ["Southern Company", 100], D: ["Dominion Energy", 50], AEP: ["American Electric Power", 60], EXC: ["Exelon", 45],
  } },
  { key: "real_estate", label: "부동산", stocks: {
    PLD: ["Prologis", 100], AMT: ["American Tower", 95], EQIX: ["Equinix", 85], SPG: ["Simon Property", 60], O: ["Realty Income", 50], PSA: ["Public Storage", 55],
  } },
  { key: "materials", label: "소재", stocks: {
    LIN: ["Linde", 220], SHW: ["Sherwin-Williams", 85], APD: ["Air Products", 65], ECL: ["Ecolab", 75], NEM: ["Newmont", 55], FCX: ["Freeport-McMoRan", 60],
  } },
];

const TICKER_META = new Map<string, { name: string; sector: string; sectorLabel: string; marketCapB: number }>();
for (const s of SECTORS) {
  for (const [ticker, [name, marketCapB]] of Object.entries(s.stocks)) {
    TICKER_META.set(ticker, { name, sector: s.key, sectorLabel: s.label, marketCapB });
  }
}
const ALL_TICKERS = [...TICKER_META.keys()];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchOne(ticker: string) {
  const meta = TICKER_META.get(ticker)!;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
      { headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const m = result?.meta;
    if (!m || typeof m.regularMarketPrice !== "number") return null;

    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c): c is number => typeof c === "number" && isFinite(c));
    const price = m.regularMarketPrice;
    // 장중에는 방금 받은 마지막 종가(오늘) 직전 값이 전일 종가, 마감 후에는 chartPreviousClose를 사용
    const prevClose =
      validCloses.length >= 2 ? validCloses[validCloses.length - 2] : typeof m.chartPreviousClose === "number" ? m.chartPreviousClose : null;
    if (prevClose == null || prevClose === 0) return null;

    const changeAmount = price - prevClose;
    const changePercent = (changeAmount / prevClose) * 100;

    return {
      ticker,
      name: meta.name,
      sector: meta.sector,
      sectorLabel: meta.sectorLabel,
      price,
      changeAmount,
      changePercent,
      marketCap: meta.marketCapB * 1_000_000_000,
    };
  } catch (e) {
    console.error(`섹터 히트맵: ${ticker} 조회 실패`, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const results = await Promise.all(ALL_TICKERS.map(fetchOne));
    const stocks = results.filter((s) => s !== null);
    console.log(`섹터 히트맵: ${ALL_TICKERS.length}종목 중 ${stocks.length}종목 시세 확보`);

    return new Response(JSON.stringify({ stocks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("섹터 히트맵 조회 실패:", e);
    return new Response(JSON.stringify({ stocks: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
