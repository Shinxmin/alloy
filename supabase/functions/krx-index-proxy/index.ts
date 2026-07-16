// 클라이언트가 KRX API 키를 직접 다루지 않도록 하는 프록시 함수 + 브라우저 CORS 우회용 서버 경유.
// KRX_API_KEY는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며 이 함수 밖으로 노출되지 않는다.
// 국내 대표 지수(코스피 등)의 오늘 장마감 종가와 최근 30일 추이를
// KRX 정보데이터시스템 Open API(idx/krx_dd_trd)로 조회한다.
// (현재 발급된 KRX_API_KEY는 "지수(idx)" 상품만 승인되어 있음)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HISTORY_DAYS = 30; // 캘린더 기준 최근 30일 조회

// 응답에 포함될 가능성이 높은 지수명을 우선순위대로 탐색 (실제 필드명을 몰라도
// 값 자체가 이 문자열과 정확히 일치하는 행을 찾는 방식이라 키 이름 추측 리스크가 없다)
const NAME_CANDIDATES = ["코스피", "KRX 300", "KRX300", "코스피 200", "코스피200", "KRX 100", "KRX100"];

function findRowByCandidateNames(rows: any[]): { row: any; name: string } | null {
  for (const name of NAME_CANDIDATES) {
    const row = rows.find((r) =>
      Object.values(r).some((v) => typeof v === "string" && v.trim() === name)
    );
    if (row) return { row, name };
  }
  return null;
}

function findRowByName(rows: any[], name: string): any | null {
  return rows.find((r) => Object.values(r).some((v) => typeof v === "string" && v.trim() === name)) ?? null;
}

const CLOSE_KEY_CANDIDATES = ["TDD_CLSPRC", "CLSPRC", "CLSPRC_IDX", "IDX_CLSPRC", "CLOSE_IDX"];

function extractClose(row: any): number | null {
  for (const key of CLOSE_KEY_CANDIDATES) {
    const v = row[key];
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/,/g, ""));
      if (isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const empty = { name: null, price: null, date: null, changeAmount: null, changePercent: null, history: [] };

  const krxApiKey = Deno.env.get("KRX_API_KEY");
  if (!krxApiKey) {
    console.error("KRX_API_KEY가 설정되지 않아 지수 정보를 조회할 수 없습니다");
    return new Response(JSON.stringify(empty), {
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

  const fetchDay = async (basDd: string): Promise<any[]> => {
    const url = `${KRX_URL}?AUTH_KEY=${encodeURIComponent(krxApiKey)}&basDd=${basDd}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`KRX 오류 (basDd=${basDd}, status=${res.status})`);
        return [];
      }
      const data = await res.json();
      return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
    } catch (e) {
      console.error(`KRX 호출 실패 (basDd=${basDd}):`, e);
      return [];
    }
  };

  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => getKstDate(i));
  const dayRows = await Promise.all(days.map((d) => fetchDay(d.basDd).then((rows) => ({ date: d.iso, rows }))));

  // 가장 최근 거래일부터 순서대로(offset 0이 오늘) 데이터가 있는 날의 후보 지수명을 찾아 고정
  let matchedName: string | null = null;
  for (const dr of dayRows) {
    if (dr.rows.length === 0) continue;
    const found = findRowByCandidateNames(dr.rows);
    if (found) {
      matchedName = found.name;
      break;
    }
  }

  if (!matchedName) {
    const firstWithRows = dayRows.find((dr) => dr.rows.length > 0);
    if (firstWithRows) {
      const sampleNames = [
        ...new Set(
          firstWithRows.rows
            .map((r: any) => Object.values(r).find((v) => typeof v === "string" && /[가-힣]/.test(v)))
            .filter(Boolean)
        ),
      ].slice(0, 60);
      console.error(`KRX 지수 후보명을 찾지 못함. 사용 가능한 이름 예시: ${JSON.stringify(sampleNames)}`);
    } else {
      console.error("KRX 지수 데이터를 최근 30일 내 하나도 가져오지 못했습니다");
    }
    return new Response(JSON.stringify(empty), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const points: { date: string; price: number }[] = [];
  let debugLogged = false;
  for (const dr of dayRows) {
    if (dr.rows.length === 0) continue;
    const row = findRowByName(dr.rows, matchedName);
    if (!row) continue;
    const price = extractClose(row);
    if (price == null) {
      if (!debugLogged) {
        console.error(`KRX 지수(${matchedName}) 종가 필드를 찾지 못함. keys=${JSON.stringify(Object.keys(row))}`);
        debugLogged = true;
      }
      continue;
    }
    points.push({ date: dr.date, price });
  }
  points.sort((a, b) => (a.date < b.date ? -1 : 1));

  const current = points.length > 0 ? points[points.length - 1] : null;
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const changeAmount = current && previous ? current.price - previous.price : null;
  const changePercent = changeAmount != null && previous && previous.price ? (changeAmount / previous.price) * 100 : null;

  console.log(`KRX 지수 조회 결과 (${matchedName}): ${points.length}/${HISTORY_DAYS}일 확보, 최신=${current?.price ?? "없음"}`);

  return new Response(
    JSON.stringify({
      name: matchedName,
      price: current ? current.price : null,
      date: current ? current.date : null,
      changeAmount,
      changePercent,
      history: points,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
