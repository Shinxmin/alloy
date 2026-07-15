// 클라이언트가 FMP API 키를 직접 다루지 않도록 하는 프록시 함수 + 브라우저 CORS 우회용 서버 경유.
// FMP_API_KEY는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며 이 함수 밖으로 노출되지 않는다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Holding = { ticker: string; currency: string };
type Quote = { symbol: string; price: number };

const primarySymbolFor = (h: Holding) => (h.currency === "KRW" ? `${h.ticker}.KS` : h.ticker);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let holdings: Holding[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.holdings)) holdings = body.holdings;
  } catch (e) {
    holdings = [];
  }

  const uniqueMap = new Map<string, Holding>();
  holdings.forEach((h) => {
    if (h && typeof h.ticker === "string" && typeof h.currency === "string") {
      uniqueMap.set(`${h.ticker}:${h.currency}`, { ticker: h.ticker, currency: h.currency });
    }
  });
  const uniqueHoldings = Array.from(uniqueMap.values());

  if (uniqueHoldings.length === 0) {
    return new Response(JSON.stringify({ prices: {} }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("FMP_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "서버에 API 키가 설정되지 않았습니다" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fetchQuotes = async (symbols: string[]): Promise<Quote[]> => {
    if (symbols.length === 0) return [];
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbols
      .map((s) => encodeURIComponent(s))
      .join(",")}?apikey=${apiKey}`;
    try {
      const res = await fetch(url);
      const bodyText = await res.text();
      if (!res.ok) {
        console.error(`FMP 오류 (symbols=${symbols.join(",")}, status=${res.status}):`, bodyText);
        return [];
      }
      const data = JSON.parse(bodyText);
      if (!Array.isArray(data)) {
        console.error(`FMP 응답이 배열이 아님 (symbols=${symbols.join(",")}):`, bodyText);
        return [];
      }
      return data;
    } catch (e) {
      console.error(`FMP 호출 실패 (symbols=${symbols.join(",")}):`, e);
      return [];
    }
  };

  const prices: Record<string, number> = {};

  // 1차 조회: USD는 티커 그대로, 원화는 KOSPI(.KS) 심볼로 우선 조회 (배치 요청으로 한 번에 조회)
  const primarySymbols = uniqueHoldings.map(primarySymbolFor);
  let primaryResults = await fetchQuotes(primarySymbols);
  // 무료 플랜에서 배치(콤마 구분 다중 심볼) 요청이 막혀 빈 배열이 오는 경우를 대비해 종목별 개별 재시도
  if (primaryResults.length === 0 && primarySymbols.length > 1) {
    const individualResults = await Promise.all(primarySymbols.map((s) => fetchQuotes([s])));
    primaryResults = individualResults.flat();
  }
  uniqueHoldings.forEach((h) => {
    const quote = primaryResults.find((q) => q.symbol === primarySymbolFor(h));
    if (quote && isFinite(quote.price) && quote.price > 0) {
      prices[h.ticker] = quote.price;
    }
  });

  // 2차 조회: 원화 종목 중 KOSPI로 못 찾은 것은 KOSDAQ(.KQ)로 재시도
  const remaining = uniqueHoldings.filter((h) => h.currency === "KRW" && !(h.ticker in prices));
  if (remaining.length > 0) {
    const secondarySymbols = remaining.map((h) => `${h.ticker}.KQ`);
    let secondaryResults = await fetchQuotes(secondarySymbols);
    if (secondaryResults.length === 0 && secondarySymbols.length > 1) {
      const individualResults = await Promise.all(secondarySymbols.map((s) => fetchQuotes([s])));
      secondaryResults = individualResults.flat();
    }
    remaining.forEach((h) => {
      const quote = secondaryResults.find((q) => q.symbol === `${h.ticker}.KQ`);
      if (quote && isFinite(quote.price) && quote.price > 0) {
        prices[h.ticker] = quote.price;
      }
    });
  }

  console.log(`stock-price-proxy 결과: ${Object.keys(prices).length}/${uniqueHoldings.length}개 조회 성공`);

  return new Response(JSON.stringify({ prices }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
