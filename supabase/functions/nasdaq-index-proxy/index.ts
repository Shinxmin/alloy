// 브라우저에서 야후 파이낸스 API를 직접 호출하면 CORS로 막히기 때문에 서버 경유용 프록시 함수.
// 별도 API 키가 필요 없는 야후 파이낸스 비공식 차트 API로 미국 지수의 실시간가/최근 30일 추이를 조회한다.
// 요청 바디로 { symbol, name }을 넘기면 해당 심볼을 조회하고, 없으면 나스닥 종합지수(^IXIC)가 기본값이다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SYMBOL = "%5EIXIC"; // ^IXIC (NASDAQ Composite)
const DEFAULT_NAME = "나스닥";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let symbol = DEFAULT_SYMBOL;
  let name = DEFAULT_NAME;
  try {
    const body = await req.json();
    if (typeof body?.symbol === "string" && body.symbol) symbol = encodeURIComponent(body.symbol);
    if (typeof body?.name === "string" && body.name) name = body.name;
  } catch (e) {
    // no-op, use defaults
  }

  const empty = { name, price: null, date: null, changeAmount: null, changePercent: null, history: [] };
  const YAHOO_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`;

  try {
    const res = await fetch(YAHOO_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`야후 파이낸스 오류 (symbol=${symbol}, status=${res.status})`);
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
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const history = timestamps
      .map((ts, i) => ({ ts, price: closes[i] }))
      .filter((p): p is { ts: number; price: number } => typeof p.price === "number" && isFinite(p.price))
      .map((p) => ({
        date: new Date(p.ts * 1000).toISOString().slice(0, 10),
        price: p.price,
      }));

    // 전일 대비는 meta.chartPreviousClose(요청한 range 시작 이전 날짜의 종가라 "전일"이 아닐 수 있음)를
    // 신뢰하지 않고, 실제로 받아온 일별 종가 히스토리의 마지막 두 값(가장 최근 거래일 vs 그 직전 거래일)으로 계산한다.
    const last = history.length > 0 ? history[history.length - 1] : null;
    const prev = history.length > 1 ? history[history.length - 2] : null;

    const currentPrice = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : last?.price ?? null;
    const previousClose = prev ? prev.price : typeof meta.previousClose === "number" ? meta.previousClose : null;

    const changeAmount = currentPrice != null && previousClose != null ? currentPrice - previousClose : null;
    const changePercent =
      changeAmount != null && previousClose ? (changeAmount / previousClose) * 100 : null;

    console.log(
      `${name} 조회 결과: 현재가=${currentPrice ?? "없음"}, 전일종가=${previousClose ?? "없음"}, 히스토리 ${history.length}개 확보`
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
