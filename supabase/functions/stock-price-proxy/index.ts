// 클라이언트가 KRX API 키를 직접 다루지 않도록 하는 프록시 함수 + 브라우저 CORS 우회용 서버 경유.
// KRX_API_KEY는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며 이 함수 밖으로 노출되지 않는다.
// 원화(KRW) 종목의 현재가를 KRX 정보데이터시스템 Open API(krx_dd_trd)로 조회한다.
// (USD 종목은 현재 지원하지 않음 - 필요 시 별도 소스 추가)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Holding = { ticker: string; currency: string };

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

  const krwHoldings: Holding[] = [];
  const seen = new Set<string>();
  holdings.forEach((h) => {
    if (h && typeof h.ticker === "string" && h.currency === "KRW" && !seen.has(h.ticker)) {
      seen.add(h.ticker);
      krwHoldings.push(h);
    }
  });

  const prices: Record<string, number> = {};

  if (krwHoldings.length === 0) {
    return new Response(JSON.stringify({ prices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const krxApiKey = Deno.env.get("KRX_API_KEY");
  if (!krxApiKey) {
    console.error("KRX_API_KEY가 설정되지 않아 원화 종목 시세를 조회할 수 없습니다");
    return new Response(JSON.stringify({ prices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
      const rows = Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
      if (rows.length > 0) {
        console.log(`KRX 응답 샘플 (basDd=${basDd}):`, JSON.stringify(rows[0]));
      }
      return rows;
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

  return new Response(JSON.stringify({ prices }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
