// 클라이언트에서 Gemini API 키를 직접 다루지 않도록 하는 프록시 함수.
// GEMINI_API_KEY는 Supabase 프로젝트의 서버 전용 시크릿으로만 보관되며
// 이 함수 밖으로 노출되지 않는다.
const AI_SYSTEM_PROMPT =
  "1. 최대 15줄 이내로 답변할 것\n" +
  "2. 볼드체(*) 사용하지 말 것\n" +
  "3. 빠르고 간략하게 사실인 내용만 확인하여 답할 것\n\n";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let prompt;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch (e) {
    prompt = null;
  }

  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "prompt가 필요합니다" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "서버에 API 키가 설정되지 않았습니다" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: AI_SYSTEM_PROMPT + prompt }] }],
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return new Response(JSON.stringify({ text: text ? text.trim() : null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Gemini API 호출 실패:", e);
    return new Response(JSON.stringify({ error: "응답을 가져오지 못했습니다" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
