// 브라우저에서 야후 파이낸스 API를 직접 호출하면 CORS로 막히기 때문에 서버 경유용 프록시 함수.
// 별도 API 키가 필요 없는 야후 파이낸스 비공식 차트 API로 나스닥 종합지수(^IXIC) 실시간가/최근 30일 추이를 조회한다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOL = "%5EIXIC"; // ^IXIC (NASDAQ Composite)
const YAHOO_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=1mo&interval=1d`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const empty = { name: "나스닥", price: null, date: null, changeAmount: null, changePercent: null, history: [] };

  try {
    const res = await fetch(YAHOO_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`야후 파이낸스 오류 (status=${res.status})`);
      return new Response(JSON.stringify(empty), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.error("야후 파이낸스: chart.result가 비어 있음", JSON.stringify(data?.chart?.error ?? {}));
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

    const currentPrice = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const previousClose =
      typeof meta.previousClose === "number"
        ? meta.previousClose
        : typeof meta.chartPreviousClose === "number"
        ? meta.chartPreviousClose
        : null;

    const changeAmount = currentPrice != null && previousClose != null ? currentPrice - previousClose : null;
    const changePercent =
      changeAmount != null && previousClose ? (changeAmount / previousClose) * 100 : null;

    console.log(
      `나스닥 조회 결과: 현재가=${currentPrice ?? "없음"}, 히스토리 ${history.length}개 확보`
    );

    return new Response(
      JSON.stringify({
        name: "나스닥",
        price: currentPrice,
        date: history.length > 0 ? history[history.length - 1].date : null,
        changeAmount,
        changePercent,
        history,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("야후 파이낸스 호출 실패:", e);
    return new Response(JSON.stringify(empty), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
