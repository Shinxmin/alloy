// 클라이언트가 FMP/KRX API 키를 직접 다루지 않도록 하는 프록시 함수 + 브라우저 CORS 우회용 서버 경유.
// FMP_API_KEY(USD 종목), KRX_API_KEY(KRW 종목)는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며 이 함수 밖으로 노출되지 않는다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Holding = { ticker: string; currency: string };
type FmpQuote = { symbol: string; price: number; change?: number; changePercentage?: number };

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

  const usdHoldings = uniqueHoldings.filter((h) => h.currency !== "KRW");
  const krwHoldings = uniqueHoldings.filter((h) => h.currency === "KRW");

  const prices: Record<string, number> = {};
  const dayChange: Record<string, { amount: number; percent: number }> = {};

  // ---- USD 종목: FMP (현재가 + 전일 대비 변동) ----
  // 2025-08-31 이후 발급된 키는 레거시 /api/v3/ 엔드포인트가 막혀 있어 신규 /stable/ 엔드포인트를 사용해야 함
  const fmpApiKey = Deno.env.get("FMP_API_KEY");
  if (usdHoldings.length > 0 && fmpApiKey) {
    const fetchBatch = async (symbols: string[]): Promise<FmpQuote[]> => {
      if (symbols.length === 0) return [];
      const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${symbols
        .map((s) => encodeURIComponent(s))
        .join(",")}&apikey=${fmpApiKey}`;
      try {
        const res = await fetch(url);
        const bodyText = await res.text();
        if (!res.ok) {
          console.error(`FMP batch-quote 오류 (symbols=${symbols.join(",")}, status=${res.status}):`, bodyText);
          return [];
        }
        const data = JSON.parse(bodyText);
        if (!Array.isArray(data)) {
          console.error(`FMP batch-quote 응답이 배열이 아님 (symbols=${symbols.join(",")}):`, bodyText);
          return [];
        }
        return data;
      } catch (e) {
        console.error(`FMP batch-quote 호출 실패 (symbols=${symbols.join(",")}):`, e);
        return [];
      }
    };

    const fetchSingle = async (symbol: string): Promise<FmpQuote | null> => {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${fmpApiKey}`;
      try {
        const res = await fetch(url);
        const bodyText = await res.text();
        if (!res.ok) {
          console.error(`FMP quote 오류 (symbol=${symbol}, status=${res.status}):`, bodyText);
          return null;
        }
        const data = JSON.parse(bodyText);
        return Array.isArray(data) ? data[0] ?? null : data ?? null;
      } catch (e) {
        console.error(`FMP quote 호출 실패 (symbol=${symbol}):`, e);
        return null;
      }
    };

    const symbols = usdHoldings.map((h) => h.ticker);
    let results = await fetchBatch(symbols);
    // 배치 요청이 막혀 빈 배열이 오는 경우를 대비해 종목별 개별 재시도
    if (results.length === 0 && symbols.length > 0) {
      const individualResults = await Promise.all(symbols.map((s) => fetchSingle(s)));
      results = individualResults.filter((q): q is FmpQuote => q !== null);
    }
    usdHoldings.forEach((h) => {
      const quote = results.find((q) => q.symbol === h.ticker);
      if (quote && isFinite(quote.price) && quote.price > 0) {
        prices[h.ticker] = quote.price;
      }
      if (quote && isFinite(quote.change) && isFinite(quote.changePercentage)) {
        dayChange[h.ticker] = { amount: quote.change as number, percent: quote.changePercentage as number };
      }
    });
  } else if (usdHoldings.length > 0 && !fmpApiKey) {
    console.error("FMP_API_KEY가 설정되지 않아 USD 종목 시세를 조회할 수 없습니다");
  }

  // ---- 원화(KRW) 종목: KRX 정보데이터시스템 Open API (현재가만 - 전일 대비는 표기하지 않음) ----
  const krxApiKey = Deno.env.get("KRX_API_KEY");
  if (krwHoldings.length > 0 && !krxApiKey) {
    console.error("KRX_API_KEY가 설정되지 않아 원화 종목 시세를 조회할 수 없습니다");
  }
  if (krwHoldings.length > 0 && krxApiKey) {
    const KRX_URL = "https://data-dbg.krx.co.kr/svc/apis/idx/krx_dd_trd";

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

    // AUTH_KEY는 HTTP 헤더가 아니라 쿼리 파라미터로 전달해야 함
    const fetchKrx = async (basDd: string): Promise<any[]> => {
      const url = `${KRX_URL}?AUTH_KEY=${encodeURIComponent(krxApiKey)}&basDd=${basDd}`;
      try {
        const res = await fetch(url);
        const bodyText = await res.text();
        if (!res.ok) {
          console.error(`KRX 오류 (basDd=${basDd}, status=${res.status}):`, bodyText);
          return [];
        }
        const data = JSON.parse(bodyText);
        return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
      } catch (e) {
        console.error(`KRX 호출 실패 (basDd=${basDd}):`, e);
        return [];
      }
    };

    // 최근 거래일을 찾을 때까지 최대 10일 전까지 역순으로 탐색 (주말/공휴일 대비)
    let rows: any[] = [];
    let resolvedDate: string | null = null;
    for (let offset = 0; offset < 10; offset++) {
      const basDd = getKstDateStr(offset);
      rows = await fetchKrx(basDd);
      if (rows.length > 0) {
        resolvedDate = basDd;
        break;
      }
    }

    if (!resolvedDate) {
      console.error("KRX: 최근 10일 내 거래일 데이터를 찾지 못했습니다");
    } else {
      const priceByCode: Record<string, number> = {};
      rows.forEach((row) => {
        const code = row?.ISU_SRT_CD ?? row?.ISU_CD;
        const priceStr = row?.TDD_CLSPRC ?? row?.CLSPRC;
        if (typeof code === "string" && typeof priceStr === "string") {
          const price = parseFloat(priceStr.replace(/,/g, ""));
          if (isFinite(price) && price > 0) priceByCode[code] = price;
        }
      });
      krwHoldings.forEach((h) => {
        if (h.ticker in priceByCode) prices[h.ticker] = priceByCode[h.ticker];
      });
      console.log(
        `KRX 조회 결과 (기준일 ${resolvedDate}, 응답 행 수 ${rows.length}): ${
          krwHoldings.filter((h) => h.ticker in prices).length
        }/${krwHoldings.length}개 조회 성공`
      );
    }
  }

  return new Response(JSON.stringify({ prices, dayChange }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
