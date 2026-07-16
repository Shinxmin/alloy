// 클라이언트가 KRX API 키를 직접 다루지 않도록 하는 프록시 함수 + 브라우저 CORS 우회용 서버 경유.
// KRX_API_KEY는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며 이 함수 밖으로 노출되지 않는다.
// 원화(KRW) 종목의 최근 일별 종가 히스토리를 KRX 정보데이터시스템 Open API(krx_dd_trd)로 조회한다.
// (숫자로만 구성된 티커만 지원)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HISTORY_DAYS = 40; // 캘린더 기준 최근 40일 조회 (주말/공휴일 제외하면 약 4~5주 분량의 거래일 확보)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let ticker: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.ticker === "string" && /^[0-9]+$/.test(body.ticker)) ticker = body.ticker;
  } catch (e) {
    // no-op, handled below
  }

  if (!ticker) {
    return new Response(JSON.stringify({ history: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const krxApiKey = Deno.env.get("KRX_API_KEY");
  if (!krxApiKey) {
    console.error("KRX_API_KEY가 설정되지 않아 종목 히스토리를 조회할 수 없습니다");
    return new Response(JSON.stringify({ history: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const KRX_URL = "https://data-dbg.krx.co.kr/svc/apis/idx/krx_dd_trd";

  // 한국은 서머타임이 없어 UTC+9 고정 오프셋으로 안전하게 KST 날짜 계산 가능
  const getKstDate = (offsetDays: number): { basDd: string; iso: string } => {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 9);
    d.setUTCDate(d.getUTCDate() - offsetDays);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return { basDd: `${y}${m}${day}`, iso: `${y}-${m}-${day}` };
  };

  const fetchDay = async (basDd: string, iso: string): Promise<{ iso: string; price: number } | null> => {
    const url = `${KRX_URL}?AUTH_KEY=${encodeURIComponent(krxApiKey)}&basDd=${basDd}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const rows = Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
      const row = rows.find((r: any) => (r?.ISU_SRT_CD ?? r?.ISU_CD) === ticker);
      const priceStr = row?.TDD_CLSPRC ?? row?.CLSPRC;
      if (typeof priceStr !== "string") return null;
      const price = parseFloat(priceStr.replace(/,/g, ""));
      if (!isFinite(price) || price <= 0) return null;
      return { iso, price };
    } catch (e) {
      console.error(`KRX 히스토리 호출 실패 (basDd=${basDd}):`, e);
      return null;
    }
  };

  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => getKstDate(i));
  const results = await Promise.all(days.map((d) => fetchDay(d.basDd, d.iso)));
  const history = results
    .filter((r): r is { iso: string; price: number } => r !== null)
    .sort((a, b) => (a.iso < b.iso ? -1 : 1))
    .map((r) => ({ date: r.iso, price: r.price }));

  console.log(`KRX 히스토리 조회 결과 (${ticker}): ${history.length}/${HISTORY_DAYS}일 확보`);

  return new Response(JSON.stringify({ history }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
