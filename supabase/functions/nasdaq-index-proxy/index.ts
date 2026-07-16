// 브라우저에서 야후 파이낸스 API를 직접 호출하면 CORS로 막히기 때문에 서버 경유용 프록시 함수.
// 별도 API 키가 필요 없는 야후 파이낸스 비공식 차트 API로 미국 지수의 실시간가/캔들(OHLC) 히스토리를 조회한다.
// 요청 바디로 { symbol, name, range, interval }을 넘길 수 있고, 없으면 나스닥 종합지수(^IXIC)의
// 최근 1개월(1mo/1d, 일봉)이 기본값이다. range/interval은 야후 파이낸스 차트 API 파라미터를 그대로 따른다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SYMBOL = "%5EIXIC"; // ^IXIC (NASDAQ Composite)
const DEFAULT_NAME = "나스닥";
const DEFAULT_RANGE = "1mo";
const DEFAULT_INTERVAL = "1d";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let symbol = DEFAULT_SYMBOL;
  let name = DEFAULT_NAME;
  let range = DEFAULT_RANGE;
  let interval = DEFAULT_INTERVAL;
  try {
    const body = await req.json();
    if (typeof body?.symbol === "string" && body.symbol) symbol = encodeURIComponent(body.symbol);
    if (typeof body?.name === "string" && body.name) name = body.name;
    if (typeof body?.range === "string" && body.range) range = body.range;
    if (typeof body?.interval === "string" && body.interval) interval = body.interval;
  } catch (e) {
    // no-op, use defaults
  }

  const empty = { name, price: null, date: null, changeAmount: null, changePercent: null, history: [] };
  const YAHOO_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;

  // 일봉/주봉(1d, 1wk, 1mo 등)은 날짜(YYYY-MM-DD), 분/시간봉은 미국 동부시간 기준 시:분으로 라벨 표기
  const isIntraday = /m$|h$/.test(interval);
  const formatLabel = (ts: number): string => {
    const d = new Date(ts * 1000);
    if (isIntraday) {
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
    }
    return d.toISOString().slice(0, 10);
  };

  try {
    const res = await fetch(YAHOO_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`야후 파이낸스 오류 (symbol=${symbol}, range=${range}, interval=${interval}, status=${res.status})`);
      return new Response(JSON.stringify(empty), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.error(`야후 파이낸스: chart.result가 비어 있음 (symbol=${symbol})`, JSON.stringify(data?.chart?.error ?? {}));
      return new Response(JSON.stringify(empty), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = result.meta ?? {};
    const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];

    const history = timestamps
      .map((ts, i) => ({ ts, open: opens[i], high: highs[i], low: lows[i], close: closes[i] }))
      .filter(
        (p): p is { ts: number; open: number; high: number; low: number; close: number } =>
          typeof p.open === "number" &&
          typeof p.high === "number" &&
          typeof p.low === "number" &&
          typeof p.close === "number" &&
          isFinite(p.close)
      )
      .map((p) => ({
        date: formatLabel(p.ts),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        price: p.close, // 캔들이 아닌 단순 라인 표시가 필요한 곳에서도 재사용 가능하도록 유지
      }));

    // 전일 대비는 meta.chartPreviousClose(요청한 range 시작 이전 날짜의 종가라 "전일"이 아닐 수 있음)를
    // 신뢰하지 않고, 실제로 받아온 종가 히스토리의 마지막 두 값(가장 최근 봉 vs 그 직전 봉)으로 계산한다.
    const last = history.length > 0 ? history[history.length - 1] : null;
    const prev = history.length > 1 ? history[history.length - 2] : null;

    const currentPrice = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : last?.close ?? null;
    const previousClose = prev ? prev.close : typeof meta.previousClose === "number" ? meta.previousClose : null;

    const changeAmount = currentPrice != null && previousClose != null ? currentPrice - previousClose : null;
    const changePercent =
      changeAmount != null && previousClose ? (changeAmount / previousClose) * 100 : null;

    console.log(
      `${name} 조회 결과 (range=${range}, interval=${interval}): 현재가=${currentPrice ?? "없음"}, 전일종가=${previousClose ?? "없음"}, 히스토리 ${history.length}개 확보`
    );

    return new Response(
      JSON.stringify({
        name,
        price: currentPrice,
        date: last ? last.date : null,
        changeAmount,
        changePercent,
        history,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(`야후 파이낸스 호출 실패 (symbol=${symbol}):`, e);
    return new Response(JSON.stringify(empty), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
