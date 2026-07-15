// 클라이언트가 FMP/KRX API 키를 직접 다루지 않도록 하는 프록시 함수 + 브라우저 CORS 우회용 서버 경유.
// FMP_API_KEY, KRX_API_KEY는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며 이 함수 밖으로 노출되지 않는다.
// USD 종목은 FMP로, 원화(KRW) 종목은 KRX 정보데이터시스템 Open API로 현재가를 조회한다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Holding = { ticker: string; currency: string };
type Quote = { symbol: string; price: number };

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

  const usdHoldings = uniqueHoldings.filter((h) => h.currency !== "KRW");
  const krwHoldings = uniqueHoldings.filter((h) => h.currency === "KRW");

  const prices: Record<string, number> = {};

  // ---- USD 종목: FMP ----
  const fmpApiKey = Deno.env.get("FMP_API_KEY");
  if (usdHoldings.length > 0 && fmpApiKey) {
    const fetchFmpQuotes = async (symbols: string[]): Promise<Quote[]> => {
      if (symbols.length === 0) return [];
      const url = `https://financialmodelingprep.com/api/v3/quote/${symbols
        .map((s) => encodeURIComponent(s))
        .join(",")}?apikey=${fmpApiKey}`;
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

    const symbols = usdHoldings.map((h) => h.ticker);
    let results = await fetchFmpQuotes(symbols);
    // 무료 플랜에서 배치(콤마 구분 다중 심볼) 요청이 막혀 빈 배열이 오는 경우를 대비해 종목별 개별 재시도
    if (results.length === 0 && symbols.length > 1) {
      const individualResults = await Promise.all(symbols.map((s) => fetchFmpQuotes([s])));
      results = individualResults.flat();
    }
    usdHoldings.forEach((h) => {
      const quote = results.find((q) => q.symbol === h.ticker);
      if (quote && isFinite(quote.price) && quote.price > 0) {
        prices[h.ticker] = quote.price;
      }
    });
  } else if (usdHoldings.length > 0 && !fmpApiKey) {
    console.error("FMP_API_KEY가 설정되지 않아 USD 종목 시세를 조회할 수 없습니다");
  }

  // ---- 원화(KRW) 종목: KRX 정보데이터시스템 Open API ----
  const krxApiKey = Deno.env.get("KRX_API_KEY");
  if (krwHoldings.length > 0 && !krxApiKey) {
    console.error("KRX_API_KEY가 설정되지 않아 원화 종목 시세를 조회할 수 없습니다");
  }
  if (krwHoldings.length > 0 && krxApiKey) {
    const KRX_BASE = "https://data-dbg.krx.co.kr/svc/apis/sto";

    // 한국은 서머타임이 없어 UTC+9 고정 오프셋으로 안전하게 KST 날짜 계산 가능
    const getKstDateStr = (offsetDays: number): string => {
      const d = new Date();
      d.setUTCHours(d.getUTCHours() + 9);
      d.setUTCDate(d.getUTCDate() - offsetDays);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    };

    const fetchKrxMarket = async (endpoint: string, basDd: string): Promise<any[]> => {
      try {
        const res = await fetch(`${KRX_BASE}/${endpoint}?basDd=${basDd}`, {
          headers: { AUTH_KEY: krxApiKey },
        });
        const bodyText = await res.text();
        if (!res.ok) {
          console.error(`KRX 오류 (${endpoint}, basDd=${basDd}, status=${res.status}):`, bodyText);
          return [];
        }
        const data = JSON.parse(bodyText);
        return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
      } catch (e) {
        console.error(`KRX 호출 실패 (${endpoint}, basDd=${basDd}):`, e);
        return [];
      }
    };

    // 최근 거래일을 찾을 때까지 최대 10일 전까지 역순으로 탐색 (주말/공휴일 대비)
    let kospiRows: any[] = [];
    let resolvedDate: string | null = null;
    for (let offset = 0; offset < 10; offset++) {
      const basDd = getKstDateStr(offset);
      kospiRows = await fetchKrxMarket("stk_bydd_trd", basDd);
      if (kospiRows.length > 0) {
        resolvedDate = basDd;
        break;
      }
    }

    if (!resolvedDate) {
      console.error("KRX: 최근 10일 내 거래일 데이터를 찾지 못했습니다");
    } else {
      const kosdaqRows = await fetchKrxMarket("ksq_bydd_trd", resolvedDate);
      const priceByCode: Record<string, number> = {};
      [...kospiRows, ...kosdaqRows].forEach((row) => {
        const code = row?.ISU_SRT_CD;
        const priceStr = row?.TDD_CLSPRC;
        if (typeof code === "string" && typeof priceStr === "string") {
          const price = parseFloat(priceStr.replace(/,/g, ""));
          if (isFinite(price) && price > 0) priceByCode[code] = price;
        }
      });
      krwHoldings.forEach((h) => {
        if (h.ticker in priceByCode) prices[h.ticker] = priceByCode[h.ticker];
      });
      console.log(
        `KRX 조회 결과 (기준일 ${resolvedDate}): ${
          krwHoldings.filter((h) => h.ticker in prices).length
        }/${krwHoldings.length}개 조회 성공`
      );
    }
  }

  console.log(`stock-price-proxy 결과: ${Object.keys(prices).length}/${uniqueHoldings.length}개 조회 성공`);

  return new Response(JSON.stringify({ prices }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
