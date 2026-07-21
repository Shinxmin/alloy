import React, { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  DIVIDEND_TAX_RATE,
  yahooSymbolCandidates,
  kstDateKey,
  heatmapCellColor,
} from "./App.jsx";

// 블록 선택 트레이에 노출되는 커스텀 블록 종류(종목 블록은 보유 종목마다 자동 생성되므로 여기 없음)
const BLOCK_TYPE_LABELS = {
  memo: "메모",
  dividend: "배당",
  dailyReturn: "일간 수익률",
};

function makeBlockId(type) {
  return `${type}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatUSD(num) {
  const rounded = Math.round(num * 100) / 100;
  return "$" + rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function GridPortfolioView() {
  // 테마(라이트/다크) - 기존 앱(App.jsx)에서 저장한 값을 그대로 읽어와 색상 통일. 이 페이지 자체는
  // 테마를 바꾸는 UI를 따로 두지 않고, 다른 탭에서 바뀐 값을 storage 이벤트로 반영한다.
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    try {
      setIsLight(localStorage.getItem("alloy_theme") === "light");
    } catch (e) {}
    const onStorage = (e) => {
      if (e.key === "alloy_theme") setIsLight(e.newValue === "light");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 로그인 세션 - 같은 브라우저의 다른 탭(기존 앱)과 localStorage 기반 세션을 공유하므로 별도 로그인
  // 화면 없이 곧바로 세션을 읽어온다.
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // 보유 종목(세로로 쌓이는 고정 축) + 그리드 레이아웃(각 종목 행에 가로로 붙은 커스텀 블록) 불러오기.
  // attachments: { [stockId]: [customBlockId, ...] } - 종목 행마다 가로로 이어붙은 커스텀 블록 순서.
  const [holdings, setHoldings] = useState([]);
  const [customBlocks, setCustomBlocks] = useState([]); // [{ id, type, text? }]
  const [attachments, setAttachments] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from("portfolios")
      .select("holdings, grid_layout")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
          const layout = data.grid_layout || {};
          setCustomBlocks(Array.isArray(layout.blocks) ? layout.blocks : []);
          setAttachments(layout.attachments && typeof layout.attachments === "object" ? layout.attachments : {});
          setDataLoaded(true);
          return;
        }
        // grid_layout 컬럼이 아직 없는 환경(스키마 마이그레이션 미적용) 등으로 위 조회가 실패해도
        // 종목 데이터만이라도 반드시 불러오도록 holdings만 다시 조회한다.
        supabase
          .from("portfolios")
          .select("holdings")
          .eq("user_id", session.user.id)
          .maybeSingle()
          .then(({ data: fallbackData, error: fallbackError }) => {
            if (cancelled) return;
            if (!fallbackError && fallbackData) {
              setHoldings(Array.isArray(fallbackData.holdings) ? fallbackData.holdings : []);
            } else if (fallbackError) {
              console.error("포트폴리오 데이터를 불러오지 못했어요:", fallbackError.message);
            }
            setDataLoaded(true);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const holdingsTickerKey = holdings.map((h) => h.ticker).join(",");
  const blockById = useMemo(() => {
    const map = {};
    customBlocks.forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [customBlocks]);

  // attachments를 실제 보유 종목에 맞춰 정리 - 삭제된 종목의 행은 제거하고, 새로 추가된 종목에는
  // 빈 행을 만들어준다.
  useEffect(() => {
    if (!dataLoaded) return;
    setAttachments((prev) => {
      const stockIds = holdings.map((_, i) => `stock-${i}`);
      const next = {};
      let changed = false;
      stockIds.forEach((id) => {
        next[id] = prev[id] || [];
        if (!prev[id]) changed = true;
      });
      Object.keys(prev).forEach((id) => {
        if (!(id in next)) changed = true;
      });
      return changed ? next : prev;
    });
  }, [holdingsTickerKey, dataLoaded]);

  // attachments 어디에도 속하지 않게 된(종목이 삭제되어 고아가 된) 커스텀 블록은 함께 정리한다.
  useEffect(() => {
    if (!dataLoaded) return;
    setCustomBlocks((prev) => {
      const referenced = new Set(Object.values(attachments).flat());
      const filtered = prev.filter((b) => referenced.has(b.id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [attachments, dataLoaded]);

  // 그리드 레이아웃 저장(디바운스) - holdings/cash_holdings는 손대지 않고 grid_layout 필드만 갱신
  useEffect(() => {
    if (!dataLoaded || !session) return;
    const timer = setTimeout(() => {
      supabase
        .from("portfolios")
        .update({ grid_layout: { blocks: customBlocks, attachments } })
        .eq("user_id", session.user.id)
        .then(({ error }) => {
          if (error) console.error("그리드 레이아웃 저장 실패:", error.message);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [customBlocks, attachments, dataLoaded, session]);

  // 원/달러 환율(KRW 자산을 USD로 환산해 배당/일간 수익률 비중 계산에 사용) - 조회 실패 시 대략값 유지
  const [todayRate, setTodayRate] = useState(1400);
  useEffect(() => {
    supabase.functions
      .invoke("nasdaq-index-proxy", { body: { symbol: "KRW=X", name: "원/달러" } })
      .then(({ data, error }) => {
        if (!error && data && data.price) setTodayRate(data.price);
      })
      .catch(() => {});
  }, []);

  // 배당 블록 + 일간 수익률 블록에 쓰일 데이터 - 종목별 배당 이력 + 최근 3개월 일봉을 한 번에 조회해
  // (연 배당금 세후 추정치, 배당률) / (원가 비중 가중 평균 일간 등락률 시계열)을 계산한다.
  const [dividendSummary, setDividendSummary] = useState({ annualUSD: 0, yieldPercent: 0, loading: false });
  const [dailyReturnCells, setDailyReturnCells] = useState({ cells: [], loading: false });

  useEffect(() => {
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    if (uniqueTickers.length === 0) {
      setDividendSummary({ annualUSD: 0, yieldPercent: 0, loading: false });
      setDailyReturnCells({ cells: [], loading: false });
      return;
    }
    let cancelled = false;
    setDividendSummary((s) => ({ ...s, loading: true }));
    setDailyReturnCells((s) => ({ ...s, loading: true }));

    const oneYearAgoSec = Date.now() / 1000 - 365 * 24 * 60 * 60;

    const fetchDividendPerShare = async (ticker) => {
      for (const symbol of yahooSymbolCandidates(ticker)) {
        try {
          const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
            body: { symbol, name: ticker, range: "1y", interval: "1mo" },
          });
          if (!error && data && data.price != null) {
            const dividends = Array.isArray(data.dividends) ? data.dividends : [];
            return dividends.filter((d) => d.ts >= oneYearAgoSec).reduce((s, d) => s + (d.amount || 0), 0);
          }
        } catch (e) {
          // 다음 후보로 계속 시도
        }
      }
      return 0;
    };

    const fetchRecentHistory = async (ticker) => {
      for (const symbol of yahooSymbolCandidates(ticker)) {
        try {
          const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
            body: { symbol, name: ticker, range: "3mo", interval: "1d" },
          });
          if (!error && data && Array.isArray(data.history) && data.history.length > 0) return data.history;
        } catch (e) {
          // 다음 후보로 계속 시도
        }
      }
      return [];
    };

    Promise.all(
      uniqueTickers.map((ticker) =>
        Promise.all([fetchDividendPerShare(ticker), fetchRecentHistory(ticker)]).then(([perShare, history]) => ({
          ticker,
          perShare,
          history,
        }))
      )
    ).then((results) => {
      if (cancelled) return;
      const byTicker = {};
      results.forEach((r) => {
        byTicker[r.ticker] = r;
      });

      // 배당: 종목별 (연 배당/주 × 수량) 세후 합산 - KRW 종목은 환율로 USD 환산해 더한다
      let annualUSD = 0;
      let costBasisUSD = 0;
      holdings.forEach((h) => {
        const perShare = byTicker[h.ticker]?.perShare || 0;
        const afterTax = perShare * h.quantity * (1 - DIVIDEND_TAX_RATE);
        const cost = h.avgPrice * h.quantity;
        if (h.currency === "USD") {
          annualUSD += afterTax;
          costBasisUSD += cost;
        } else {
          annualUSD += afterTax / todayRate;
          costBasisUSD += cost / todayRate;
        }
      });
      setDividendSummary({
        annualUSD,
        yieldPercent: costBasisUSD > 0 ? (annualUSD / costBasisUSD) * 100 : 0,
        loading: false,
      });

      // 일간 수익률: 종목별 전일 대비 등락률(%)을 원가(USD 환산) 비중으로 가중 평균한 시계열
      const weights = {};
      uniqueTickers.forEach((ticker) => {
        const h = holdings.find((x) => x.ticker === ticker);
        if (!h) return;
        const cost = h.avgPrice * h.quantity * (h.currency === "USD" ? 1 : 1 / todayRate);
        weights[ticker] = (weights[ticker] || 0) + cost;
      });

      const perTickerReturns = {};
      results.forEach(({ ticker, history }) => {
        const map = {};
        for (let i = 1; i < history.length; i++) {
          const prevClose = history[i - 1].close;
          if (!(prevClose > 0)) continue;
          map[kstDateKey(history[i].ts)] = ((history[i].close - prevClose) / prevClose) * 100;
        }
        perTickerReturns[ticker] = map;
      });

      const allDateKeys = new Set();
      Object.values(perTickerReturns).forEach((m) => Object.keys(m).forEach((k) => allDateKeys.add(k)));
      const recentDates = [...allDateKeys].sort().slice(-14);

      const cells = recentDates.map((dateKey) => {
        let weightedSum = 0;
        let weightSum = 0;
        uniqueTickers.forEach((ticker) => {
          const pct = perTickerReturns[ticker]?.[dateKey];
          if (pct == null) return;
          const w = weights[ticker] || 0;
          weightedSum += pct * w;
          weightSum += w;
        });
        return { dateKey, returnPct: weightSum > 0 ? weightedSum / weightSum : null };
      });
      setDailyReturnCells({ cells, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [holdingsTickerKey, todayRate]);

  // 커스텀 블록(메모) 텍스트 수정
  const updateMemoText = (id, text) => {
    setCustomBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  };

  // 드래그 앤 드롭 - 포인터 이벤트 기반(마우스/터치 공용). 종목 블록은 보유 종목 순서대로 세로로
  // 고정 배치되며 드래그할 수 없다. 트레이의 블록 칩을 특정 종목 행에 놓으면 그 행의 가로 사슬
  // 끝에 새 블록이 붙고, 이미 붙어있는 커스텀 블록을 다른(또는 같은) 행에 놓으면 그 행 끝으로
  // 옮겨진다. 커스텀 블록을 트레이 위로 다시 끌어오면 삭제된다.
  const [drag, setDrag] = useState(null); // { kind: 'tray'|'canvas', blockType?, blockId?, x, y, overRow, overTray }
  const rowRefs = useRef({});
  const trayRef = useRef(null);

  const hitTestRow = (x, y) => {
    for (const stockId of Object.keys(rowRefs.current)) {
      const el = rowRefs.current[stockId];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return stockId;
    }
    return null;
  };
  const isPointInTray = (x, y) => {
    const el = trayRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const dragRef = useRef(null);
  dragRef.current = drag;

  // 새로 붙은(=결합된) 블록의 이음새에 "합금 용접" 반짝임을 한 번 재생하기 위한 상태
  const [fuseFlash, setFuseFlash] = useState(null); // { rowStockId, blockId, token }
  const clearFuseFlash = () => setFuseFlash(null);

  const handlePointerMove = (e) => {
    const x = e.clientX;
    const y = e.clientY;
    setDrag((d) => (d ? { ...d, x, y, overRow: hitTestRow(x, y), overTray: isPointInTray(x, y) } : d));
  };

  const commitDrag = (d) => {
    if (d.kind === "canvas" && d.overTray) {
      setAttachments((prev) => {
        const next = {};
        for (const [stockId, ids] of Object.entries(prev)) {
          next[stockId] = ids.filter((id) => id !== d.blockId);
        }
        return next;
      });
      setCustomBlocks((prev) => prev.filter((b) => b.id !== d.blockId));
      return;
    }
    if (!d.overRow) return;
    if (d.kind === "tray") {
      const newBlock = { id: makeBlockId(d.blockType), type: d.blockType, text: "" };
      setCustomBlocks((prev) => [...prev, newBlock]);
      setAttachments((prev) => ({ ...prev, [d.overRow]: [...(prev[d.overRow] || []), newBlock.id] }));
      setFuseFlash({ rowStockId: d.overRow, blockId: newBlock.id, token: Date.now() });
    } else {
      setAttachments((prev) => {
        const next = {};
        for (const [stockId, ids] of Object.entries(prev)) {
          next[stockId] = ids.filter((id) => id !== d.blockId);
        }
        next[d.overRow] = [...(next[d.overRow] || []), d.blockId];
        return next;
      });
      setFuseFlash({ rowStockId: d.overRow, blockId: d.blockId, token: Date.now() });
    }
  };

  const handlePointerUp = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    const d = dragRef.current;
    setDrag(null);
    if (d) commitDrag(d);
  };

  const startDrag = (initial) => (e) => {
    e.preventDefault();
    setDrag({ ...initial, x: e.clientX, y: e.clientY, overRow: null, overTray: false });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textColor = isLight ? "#14161A" : "#FFFFFF";
  const mutedColor = isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)";
  const borderColor = isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)";
  const cardBg = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.06)";

  const goBack = () => {
    window.location.href = window.location.pathname;
  };

  const containerStyle = {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    background: isLight ? "#F4F3EE" : "#141413",
    color: textColor,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    paddingBottom: 150,
  };

  if (!authChecked || (authChecked && !session)) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: mutedColor, marginBottom: 12 }}>
            {authChecked ? "로그인이 필요해요" : "불러오는 중..."}
          </div>
          {authChecked && (
            <button
              onClick={goBack}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 10,
                border: `1px solid ${borderColor}`,
                background: "transparent",
                color: textColor,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              기존 화면으로 돌아가기
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ padding: "28px 20px 20px" }}>
        <h1 style={{ margin: "0 0 2px 0", fontSize: 22, fontWeight: 700, letterSpacing: 0.2 }}>αlloy</h1>
        <div style={{ fontSize: 13, color: mutedColor }}>새로운 디자인 (베타)</div>
      </div>

      {holdings.length === 0 ? (
        <div style={{ padding: "0 20px", fontSize: 13, color: mutedColor }}>
          아직 등록된 종목이 없어요. 기존 포트폴리오 탭에서 종목을 추가해주세요.
        </div>
      ) : (
        <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {holdings.map((holding, i) => {
            const stockId = `stock-${i}`;
            const chainIds = [stockId, ...(attachments[stockId] || [])];
            const isOverThisRow = drag && drag.overRow === stockId && !drag.overTray;

            return (
              <div
                key={stockId}
                ref={(el) => (rowRefs.current[stockId] = el)}
                style={{
                  display: "flex",
                  overflowX: "auto",
                  borderRadius: 22,
                  outline: isOverThisRow ? `2px dashed ${isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)"}` : "2px dashed transparent",
                  outlineOffset: 3,
                  transition: "outline-color 0.15s ease",
                }}
              >
                {chainIds.map((id, idx) => {
                  const isStock = id === stockId;
                  const block = isStock ? null : blockById[id];
                  if (!isStock && !block) return null;
                  const leftRounded = idx === 0;
                  const rightRounded = idx === chainIds.length - 1;
                  const isDraggingThis = drag && drag.kind === "canvas" && drag.blockId === id;
                  const isFusing = fuseFlash && fuseFlash.rowStockId === stockId && fuseFlash.blockId === id;

                  return (
                    <div
                      key={id}
                      style={{
                        position: "relative",
                        flexShrink: 0,
                        width: 168,
                        minHeight: 148,
                        boxSizing: "border-box",
                        padding: "14px 14px 12px",
                        marginRight: idx === chainIds.length - 1 ? 0 : 4,
                        borderRadius: `${leftRounded ? 20 : 6}px ${rightRounded ? 20 : 6}px ${rightRounded ? 20 : 6}px ${leftRounded ? 20 : 6}px`,
                        border: `1px solid ${borderColor}`,
                        background: cardBg,
                        opacity: isDraggingThis ? 0.35 : 1,
                        display: "flex",
                        flexDirection: "column",
                        transition: "border-radius 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s ease",
                      }}
                    >
                      {/* 합금(alloy) 용접 이펙트: 새 블록이 행에 붙는 순간 마주한 안쪽 모서리를 따라
                          금빛 빛이 한 번 스치듯 지나가는 애니메이션(카드는 여전히 완전히 독립적이며
                          트레이로 다시 끌어 분리할 수 있다). */}
                      {isFusing && (
                        <div
                          onAnimationEnd={clearFuseFlash}
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: -1,
                            width: 6,
                            background:
                              "linear-gradient(180deg, rgba(255,214,140,0) 0%, rgba(255,214,140,0.95) 50%, rgba(255,214,140,0) 100%)",
                            animation: "alloyFuse 0.8s ease-out",
                            pointerEvents: "none",
                          }}
                        />
                      )}

                      {isStock && (
                        <StockBlockCard holding={holding} textColor={textColor} mutedColor={mutedColor} />
                      )}
                      {block && block.type === "memo" && (
                        <MemoBlockCard
                          block={block}
                          textColor={textColor}
                          mutedColor={mutedColor}
                          onChange={(text) => updateMemoText(block.id, text)}
                        />
                      )}
                      {block && block.type === "dividend" && (
                        <DividendBlockCard summary={dividendSummary} textColor={textColor} mutedColor={mutedColor} />
                      )}
                      {block && block.type === "dailyReturn" && (
                        <DailyReturnBlockCard data={dailyReturnCells} isLight={isLight} mutedColor={mutedColor} />
                      )}

                      {!isStock && (
                        <button
                          onPointerDown={startDrag({ kind: "canvas", blockId: id })}
                          aria-label="블록 이동"
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            width: 22,
                            height: 22,
                            border: "none",
                            background: "transparent",
                            color: mutedColor,
                            cursor: "grab",
                            touchAction: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="7" cy="6" r="1.6" />
                            <circle cx="7" cy="12" r="1.6" />
                            <circle cx="7" cy="18" r="1.6" />
                            <circle cx="15" cy="6" r="1.6" />
                            <circle cx="15" cy="12" r="1.6" />
                            <circle cx="15" cy="18" r="1.6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* 행 끝에 항상 보이는 점선 "+" 칸 - 실제 드롭 판정은 행 전체(세로 범위) 기준이라
                    이 칸 위가 아니어도 붙지만, 여기에 놓으라는 시각적 안내 역할을 한다. */}
                <div
                  style={{
                    flexShrink: 0,
                    width: 64,
                    minHeight: 148,
                    borderRadius: 20,
                    border: `1px dashed ${borderColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: mutedColor,
                    fontSize: 18,
                    opacity: 0.5,
                    boxSizing: "border-box",
                  }}
                >
                  +
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 드래그 중 포인터를 따라다니는 미리보기 */}
      {drag && (
        <div
          style={{
            position: "fixed",
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -50%)",
            zIndex: 20,
            pointerEvents: "none",
            padding: "8px 14px",
            borderRadius: 12,
            background: isLight ? "rgba(255,255,255,0.92)" : "rgba(40,40,38,0.92)",
            border: `1px solid ${borderColor}`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            fontSize: 12,
            fontWeight: 700,
            color: textColor,
          }}
        >
          {drag.kind === "tray" ? BLOCK_TYPE_LABELS[drag.blockType] : BLOCK_TYPE_LABELS[blockById[drag.blockId]?.type]}
        </div>
      )}

      {/* 하단 고정 영역: 블록 선택 트레이(리퀴드 글라스) + 돌아가기 버튼 */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0 14px 18px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          ref={trayRef}
          style={{
            width: "100%",
            maxWidth: 440,
            display: "flex",
            gap: 8,
            padding: 10,
            borderRadius: 20,
            background: isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: `1px solid ${borderColor}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            boxSizing: "border-box",
            outline: drag && drag.overTray ? `2px solid ${isLight ? "#B23B3B" : "#FF8A8A"}` : "none",
            transition: "outline 0.15s ease",
          }}
        >
          {Object.entries(BLOCK_TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              onPointerDown={startDrag({ kind: "tray", blockType: type })}
              style={{
                flex: 1,
                height: 44,
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                background: isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.06)",
                color: textColor,
                fontSize: 12,
                fontWeight: 700,
                cursor: "grab",
                touchAction: "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={goBack}
          style={{
            height: 34,
            padding: "0 16px",
            borderRadius: 999,
            border: `1px solid ${borderColor}`,
            background: isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            color: mutedColor,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          기존 디자인으로 돌아가기
        </button>
      </div>
    </div>
  );
}

// 종목 블록: 티커/종목명/수량·단가/통화 - 보유 종목 순서대로 세로로 고정 배치되며 드래그할 수 없다.
function StockBlockCard({ holding, textColor, mutedColor }) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, color: textColor }}>{holding.ticker}</div>
      <div
        style={{
          fontSize: 12,
          color: mutedColor,
          marginTop: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {holding.name || holding.ticker}
      </div>
      <div style={{ marginTop: "auto", fontSize: 13, fontWeight: 600, color: textColor }}>
        {holding.quantity}주 · {holding.currency === "USD" ? "$" : "₩"}
        {Number(holding.avgPrice).toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>{holding.currency}</div>
    </>
  );
}

// 메모 블록: 자유 텍스트
function MemoBlockCard({ block, textColor, mutedColor, onChange }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: mutedColor, marginBottom: 6 }}>메모</div>
      <textarea
        value={block.text || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="메모를 입력하세요"
        style={{
          flex: 1,
          width: "100%",
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          color: textColor,
          fontSize: 13,
          fontFamily: "inherit",
          boxSizing: "border-box",
          padding: 0,
        }}
      />
    </>
  );
}

// 배당 블록: 보유 종목 전체의 연 배당금(세후) 추정치 + 배당률
function DividendBlockCard({ summary, textColor, mutedColor }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: mutedColor, marginBottom: 6 }}>배당(연, 세후)</div>
      {summary.loading ? (
        <div style={{ fontSize: 12, color: mutedColor }}>불러오는 중...</div>
      ) : (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: textColor }}>{formatUSD(summary.annualUSD)}</div>
          <div style={{ marginTop: "auto", fontSize: 12, color: mutedColor }}>
            배당률 {summary.yieldPercent.toFixed(2)}%
          </div>
        </>
      )}
    </>
  );
}

// 일간 수익률 블록: 최근 14거래일 원가 비중 가중 평균 등락률을 작은 색상 칸으로 표기
function DailyReturnBlockCard({ data, isLight, mutedColor }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: mutedColor, marginBottom: 8 }}>일간 수익률(최근 14일)</div>
      {data.loading ? (
        <div style={{ fontSize: 12, color: mutedColor }}>불러오는 중...</div>
      ) : data.cells.length === 0 ? (
        <div style={{ fontSize: 12, color: mutedColor }}>데이터가 없어요</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: "auto" }}>
          {data.cells.map((cell) => (
            <div
              key={cell.dateKey}
              title={cell.returnPct == null ? cell.dateKey : `${cell.dateKey} ${cell.returnPct >= 0 ? "+" : ""}${cell.returnPct.toFixed(2)}%`}
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: heatmapCellColor(cell.returnPct, isLight),
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
