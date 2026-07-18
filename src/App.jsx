import React, { useState, useRef, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ComposedChart,
  Bar,
} from "recharts";
import { supabase } from "./supabaseClient";

// 텍스트를 한 글자씩 타이핑되는 것처럼 보여주는 공용 훅 (버튼 등 UI 요소가 아닌 설명 텍스트용)
function useTypedText(text) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (!text) return;
    const interval = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(interval);
          return c;
        }
        return c + 1;
      });
    }, 20);
    return () => clearInterval(interval);
  }, [text]);
  return text ? text.slice(0, count) : "";
}

// 앱 버전 표기(설정 탭, 계정 섹션 아래). 소수점 마지막 자리는 PR이 업데이트될 때마다 해당 PR 번호로 갱신한다.
const APP_VERSION = "0.1.118";

// 배당소득세 원천징수세율(15%). 야후 파이낸스에서 받아오는 배당 금액은 세전 금액이므로,
// 실수령 기준으로 표기하는 모든 배당 관련 계산(연 배당 %, 연 배당금 예상치, 배당 캘린더)에 공통 적용한다.
const DIVIDEND_TAX_RATE = 0.15;

// 지수 모달 캔들차트 표기 주기 (야후 파이낸스 차트 API의 range/interval 파라미터)
const INDEX_CANDLE_PERIODS = [
  { key: "1d", label: "1일", range: "1d", interval: "5m" },
  { key: "1w", label: "1주", range: "5d", interval: "15m" },
  { key: "3mo", label: "3달", range: "3mo", interval: "1d" },
  { key: "1y", label: "1년", range: "1y", interval: "1wk" },
];


// Intl.DateTimeFormat의 formatToParts 결과에서 특정 필드만 뽑아내는 헬퍼
function getDatePart(parts, type) {
  return parts.find((p) => p.type === type)?.value || "";
}

// interval 문자열(5m, 15m, 1d, 1wk 등)로 분/시간봉인지(장중 시각이 의미 있는지) 판단
function isIntradayInterval(interval) {
  return /m$|h$/.test(interval || "");
}

// KST 기준 "월/일(요일)" (예: 07/16(목))
function formatKstDatePart(ts) {
  const d = new Date(ts * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(d);
  return `${getDatePart(parts, "month")}/${getDatePart(parts, "day")}(${weekday})`;
}

// KST 기준 "년/월/일(요일)" (예: 26/07/16(목))
function formatKstYearDatePart(ts) {
  const d = new Date(ts * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(d);
  return `${getDatePart(parts, "year")}/${getDatePart(parts, "month")}/${getDatePart(parts, "day")}(${weekday})`;
}

// KST 기준 "시:분"
function formatKstTimePart(ts) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts * 1000));
  return `${getDatePart(parts, "hour")}:${getDatePart(parts, "minute")}`;
}

// X축 하단 라벨: 주기별로 KST 기준 표기 형식이 다름
// 1일 = 시:분(22:00), 1주 = 월/일(요일)(07/11(화)), 3달/1년 = 년/월/일(요일)(26/07/11(화))
function formatKstAxisLabel(ts, periodKey) {
  if (periodKey === "1d") return formatKstTimePart(ts);
  if (periodKey === "1w") return formatKstDatePart(ts);
  return formatKstYearDatePart(ts);
}

// 캔들차트 툴팁: "07/16(목) 23:00 7,500"(1일·1주) 또는 "07/16(목) 7,500"(3달·1년) 한 줄로만 표기
function IndexCandleTooltip({ active, payload, isLight, interval }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const close = d.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const datePart = formatKstDatePart(d.ts);
  const text = isIntradayInterval(interval) ? `${datePart} ${formatKstTimePart(d.ts)} ${close}` : `${datePart} ${close}`;
  return (
    <div
      style={{
        background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
        border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        padding: "6px 10px",
        color: isLight ? "#14161A" : "#FFFFFF",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

// 캔들(봉) 모양 커스텀 렌더러 - recharts Bar의 dataKey를 [low, high] 범위로 넘겨
// y/height가 이미 저가~고가 구간에 맞춰져 있으므로, 그 안에서 시가/종가 위치만 비례 계산해 몸통을 그린다.
function IndexCandleShape(props) {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;
  if (!isFinite(y) || !isFinite(height) || height < 0) return null;
  const isUp = close >= open;
  const color = isUp ? "#FF5C5C" : "#4D9FFF";
  const bodyWidth = Math.max(width * 0.6, 2);
  const bodyX = x + (width - bodyWidth) / 2;
  const wickX = x + width / 2;

  if (high === low || height === 0) {
    // 고가/저가가 없어 시가=고가=저가=종가로 대체된 지점(예: 분봉 환율 데이터)은
    // 캔들 몸통 대신 해당 가격 위치에 납작한 마커만 그려 값이 아예 안 보이지 않게 한다.
    return <rect x={bodyX} y={y - 1} width={bodyWidth} height={2} fill={color} />;
  }

  const scale = height / (high - low);
  const openY = y + (high - open) * scale;
  const closeY = y + (high - close) * scale;
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
  return (
    <g>
      <line x1={wickX} y1={y} x2={wickX} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

// 나스닥/S&P500 모달에서 공용으로 쓰는 캔들차트 + 표기 주기 탭 (1일/1주/3달/1년)
function IndexCandleChart({ isLight, period, onPeriodChange, candles, candlesLoading }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
        {INDEX_CANDLE_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPeriodChange(p.key)}
            style={{
              padding: "3px 8px",
              borderRadius: 8,
              border: "none",
              background:
                period === p.key
                  ? isLight
                    ? "rgba(20,22,26,0.14)"
                    : "rgba(255,255,255,0.14)"
                  : "transparent",
              color:
                period === p.key
                  ? isLight
                    ? "#14161A"
                    : "#FFFFFF"
                  : isLight
                  ? "rgba(20,22,26,0.4)"
                  : "rgba(255,255,255,0.4)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
              transition: "background 0.2s ease, color 0.2s ease",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ width: "100%", height: 150 }}>
        {candlesLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: 12,
              color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
            }}
          >
            불러오는 중...
          </div>
        ) : candles.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: 12,
              color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
            }}
          >
            차트 정보를 불러올 수 없어요
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={candles} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="ts"
                tickFormatter={(ts) => formatKstAxisLabel(ts, period)}
                tick={{
                  fontSize: 9,
                  fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                content={(props) => (
                  <IndexCandleTooltip
                    {...props}
                    isLight={isLight}
                    interval={INDEX_CANDLE_PERIODS.find((p) => p.key === period)?.interval}
                  />
                )}
              />
              <Bar dataKey={(d) => [d.low, d.high]} shape={IndexCandleShape} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// 야후 파이낸스 지수(주가지수/환율/금리) 공통 데이터 조회 훅.
// S&P500/나스닥/코스피/코스닥과 동일한 헤더값+캔들차트 조회 패턴을 재사용한다.
function useYahooIndex(symbol, name) {
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [period, setPeriod] = useState("1d");
  const [candles, setCandles] = useState([]);
  const [candlesLoading, setCandlesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("nasdaq-index-proxy", { body: { symbol, name } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setIndex(!error && data && data.price != null ? data : null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIndex(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = () => {
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  };
  const close = () => {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 300);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === period) || INDEX_CANDLE_PERIODS[0];
    setCandlesLoading(true);
    supabase.functions
      .invoke("nasdaq-index-proxy", {
        body: { symbol, name, range: cfg.range, interval: cfg.interval },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setCandles(!error && data && Array.isArray(data.history) ? data.history : []);
        setCandlesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setCandles([]);
          setCandlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, period]);

  return {
    index,
    loading,
    modalOpen,
    modalVisible,
    hovered,
    setHovered,
    open,
    close,
    closeRef,
    period,
    setPeriod,
    candles,
    candlesLoading,
  };
}

// useYahooIndex 상태를 받아 캔들차트 모달을 렌더링 (S&P500/코스피 모달과 동일한 크기/스타일)
function IndexModal({ isLight, state }) {
  if (!state.modalOpen || !state.index) return null;
  return (
    <div
      onClick={state.close}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        background: state.modalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
        backdropFilter: state.modalVisible ? "blur(6px)" : "blur(0px)",
        WebkitBackdropFilter: state.modalVisible ? "blur(6px)" : "blur(0px)",
        transition: "background 0.35s ease, backdrop-filter 0.35s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(304px, 80vw)",
          padding: "22px 20px",
          borderRadius: 20,
          background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
          opacity: state.modalVisible ? 1 : 0,
          transform: state.modalVisible ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
          transition:
            "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
          boxSizing: "border-box",
        }}
      >
        <h2
          style={{
            margin: "0 0 4px 0",
            fontSize: 17,
            fontWeight: 600,
            color: isLight ? "#14161A" : "#FFFFFF",
            letterSpacing: 0.2,
          }}
        >
          {state.index.name}
        </h2>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: isLight ? "#14161A" : "#FFFFFF",
            }}
          >
            {state.index.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {state.index.changeAmount != null && state.index.changePercent != null && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: state.index.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
              }}
            >
              {state.index.changeAmount >= 0 ? "▲ " : "▼ "}
              {Math.abs(state.index.changeAmount).toFixed(2)} (
              {state.index.changePercent >= 0 ? "+" : ""}
              {state.index.changePercent.toFixed(2)}%)
            </span>
          )}
        </div>

        <IndexCandleChart
          isLight={isLight}
          period={state.period}
          onPeriodChange={state.setPeriod}
          candles={state.candles}
          candlesLoading={state.candlesLoading}
        />
      </div>
    </div>
  );
}

export default function Alloy() {
  const tabs = ["A", "B", "C"];
  const [active, setActive] = useState(0);

  // 탭 전환 시 이전 탭의 스크롤 위치가 유지되어 콘텐츠가 적은 탭에서
  // 스크롤이 아래로 내려간 채로 보이는 문제 방지
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [active]);

  // 아이폰 사파리는 100vh가 주소창을 뺀 실제 화면보다 커서 콘텐츠가 없어도
  // 스크롤이 생기므로, 실제 뷰포트 높이(window.innerHeight)를 추적해 사용
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const updateVh = () => setVh(window.innerHeight);
    updateVh();
    window.addEventListener("resize", updateVh);
    window.addEventListener("orientationchange", updateVh);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateVh);
    }
    return () => {
      window.removeEventListener("resize", updateVh);
      window.removeEventListener("orientationchange", updateVh);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateVh);
      }
    };
  }, []);

  // 아이폰 사파리에서 키보드가 올라오면 fixed 요소가 가려지는 문제 방지:
  // visualViewport로 키보드 높이를 추적해 터미널 패널을 그만큼 띄워줌
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const updateKeyboardOffset = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    updateKeyboardOffset();
    vv.addEventListener("resize", updateKeyboardOffset);
    vv.addEventListener("scroll", updateKeyboardOffset);
    return () => {
      vv.removeEventListener("resize", updateKeyboardOffset);
      vv.removeEventListener("scroll", updateKeyboardOffset);
    };
  }, []);

  // Supabase 로그인 세션
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState("signIn"); // "signIn" | "signUp"
  // 마지막으로 로그인했던 이메일을 기억해뒀다가 재로그인 창에 미리 채워준다 - 세션이 오래 쉬다가
  // 끊겼을 때(브라우저 탭이 몇 시간 동안 백그라운드에 있으면 토큰 자동 갱신이 실패할 수 있음)
  // 다시 로그인하기까지의 마찰을 줄이기 위함. 데이터 자체는 이미 Supabase에 저장돼 있어
  // 재로그인만 하면 그대로 복구된다.
  const [authEmail, setAuthEmail] = useState(() => {
    try {
      return localStorage.getItem("alloy_last_email") || "";
    } catch (e) {
      return "";
    }
  });
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  // "세션이 만료되었어요" 안내는 실제로 이 페이지에서 로그인되어 있다가 끊긴 경우에만 보여준다.
  // 브라우저를 새로 열었을 때(탭을 닫았다 다시 켠 경우 등)나 사용자가 직접 로그아웃한 경우는
  // "만료"가 아니라 정상적인 흐름이므로 제외한다.
  const [isReturningSession, setIsReturningSession] = useState(false);
  const wasAuthenticatedRef = useRef(false);
  const explicitSignOutRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
      if (data.session) wasAuthenticatedRef.current = true;
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        wasAuthenticatedRef.current = true;
        explicitSignOutRef.current = false;
        setIsReturningSession(false);
        try {
          localStorage.setItem("alloy_last_email", newSession.user.email || "");
        } catch (e) {
          // localStorage 사용 불가 시 무시
        }
      } else {
        setIsReturningSession(wasAuthenticatedRef.current && !explicitSignOutRef.current);
        wasAuthenticatedRef.current = false;
        explicitSignOutRef.current = false;
      }
    });
    // 브라우저 탭이 오래 백그라운드에 있으면 토큰 자동 갱신 타이머가 지연될 수 있다.
    // 탭이 다시 보이게 될 때마다 세션 상태를 명시적으로 재확인해, 만료된 세션을 최대한 빨리
    // 감지(또는 복구)하도록 보강한다.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data }) => {
          // 세션을 "복구"하는 용도로만 사용한다 - data.session이 없다고 해서 여기서 곧바로
          // null로 덮어쓰면, 진짜 로그아웃이 아닌 일시적인 조회 지연/타이밍 문제로도 방금
          // 로그인한 세션이 날아갈 수 있다. 실제 로그아웃(SIGNED_OUT)은 onAuthStateChange가
          // 알아서 알려주므로, 여기서는 유효한 세션을 찾았을 때만 반영한다.
          if (data.session) setSession(data.session);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthSubmitting(true);
    try {
      if (authMode === "signUp") {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setAuthNotice("가입 확인 이메일을 보냈어요. 메일함을 확인해주세요.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err.message || "오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    explicitSignOutRef.current = true;
    await supabase.auth.signOut();
  };
  const [hovered, setHovered] = useState(null);
  const btnRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // 명령어 입력창 (채팅 입력 버튼 + 리퀴드 글래스 패널)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatHovered, setChatHovered] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatSortMode, setChatSortMode] = useState(false);
  const [sortHoverIdx, setSortHoverIdx] = useState(null);
  const [pendingCommand, setPendingCommand] = useState(null); // { kind: "sort", criteria } | { kind: "target", ticker, percent }
  const [runningTypedCount, setRunningTypedCount] = useState(0);
  const [chatDoneNotice, setChatDoneNotice] = useState(false);
  const [chatDoneText, setChatDoneText] = useState("");
  const [doneTypedCount, setDoneTypedCount] = useState(0);
  const [cmdHoverIdx, setCmdHoverIdx] = useState(null);
  const [targetNoticeText, setTargetNoticeText] = useState(null);
  const [targetGridHoverIdx, setTargetGridHoverIdx] = useState(null);
  const sortPromptText =
    chatSortMode && !pendingCommand && !chatDoneNotice
      ? "어떤 기준으로 정렬할까요?"
      : "";
  const typedSortPrompt = useTypedText(sortPromptText);
  const typedTargetNotice = useTypedText(targetNoticeText || "");
  // /target 명령에서 티커를 아직 선택하지 않은 상태(비중까지 입력하면 두 번째 공백이 생겨 false가 됨)
  const isTargetTickerSelect = /^\/target( [^\s]*)?$/.test(chatMessage);
  const COMMAND_RUNNING_TEXT = "명령어를 실행하고 있습니다";
  const COMMANDS = [
    { name: "sort", desc: "정렬" },
    { name: "target", desc: "목표 비중", usage: "[종목] [비중(%)]" },
  ];

  const toggleChat = () => {
    if (chatOpen) {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      setChatVisible(false);
      setTimeout(() => setChatOpen(false), 300);
    } else {
      setChatOpen(true);
      setChatSortMode(false);
      setPendingCommand(null);
      setChatDoneNotice(false);
      setTargetNoticeText(null);
      requestAnimationFrame(() => setChatVisible(true));
    }
  };

  const handleChatSend = () => {
    const trimmed = chatMessage.trim();
    if (trimmed === "/sort") {
      setChatSortMode(true);
      setChatMessage("");
      return;
    }
    if (trimmed.startsWith("/target")) {
      const parts = trimmed.split(/\s+/);
      const percent = parseFloat((parts[2] || "").replace("%", ""));
      if (parts.length === 3 && parts[1] && isFinite(percent)) {
        setPendingCommand({ kind: "target", ticker: parts[1], percent });
      } else {
        setTargetNoticeText("사용법: /target [티커] [%]");
      }
      setChatMessage("");
      return;
    }
    setChatMessage("");
  };

  // 입력창이 사라지는 상태로 전환되면(선택지/실행중/완료) 아이폰 사파리 키보드를
  // 명시적으로 닫아줌 - input을 DOM에서 없애는 것만으로는 키보드가 자동으로
  // 닫히지 않는 경우가 있어, 키보드가 계속 열려있으면 터미널 패널이 원위치로
  // 돌아오지 않는 문제가 생김
  useEffect(() => {
    if (chatSortMode || pendingCommand || chatDoneNotice) {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }
  }, [chatSortMode, pendingCommand, chatDoneNotice]);

  const [theme, setTheme] = useState("dark"); // "dark" | "light" | "sunset" | "forest"
  // 테마별 대표 색상/그라데이션 (배경 레이어와 /theme 선택지 원형 스와치에서 공용으로 사용)
  const THEME_SWATCHES = {
    light: "#F8F9FA",
    dark: "#17191D",
    sunset: "radial-gradient(circle at 50% 50%, #47301e 0%, #2a1f1a 55%, #17191D 95%)",
    forest: "radial-gradient(circle at 50% 50%, #1f3d28 0%, #1a2a20 55%, #17191D 95%)",
  };
  const [themeHovered, setThemeHovered] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const isLight = theme === "light";

  // 저장된 테마 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem("alloy_theme");
      if (saved === "light" || saved === "sunset" || saved === "forest") setTheme(saved);
    } catch (e) {}
    setThemeLoaded(true);
  }, []);

  // 테마 변경 시 저장
  useEffect(() => {
    if (!themeLoaded) return;
    try {
      localStorage.setItem("alloy_theme", theme);
    } catch (e) {}
  }, [theme, themeLoaded]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  useEffect(() => {
    const el = btnRefs.current[active];
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [active]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [assetType, setAssetType] = useState("stock"); // "stock" | "cash"
  const [editIndex, setEditIndex] = useState(null); // null = 추가 모드, 숫자 = 수정 모드
  const [deleteHovered, setDeleteHovered] = useState(false);
  // 삭제 버튼(X 아이콘)을 닫기 버튼으로 착각해 누르는 실수를 막기 위한 2단계 확인 상태.
  // 첫 클릭에서는 확인 상태로만 전환하고, 그 상태에서 다시 누를 때만 실제로 삭제한다.
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [draggedInfo, setDraggedInfo] = useState(null); // { key: 'stocks'|'cash', index }
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [ticker, setTicker] = useState("");
  const [stockName, setStockName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("KRW"); // "KRW" | "USD"
  const [exchangeRate, setExchangeRate] = useState("");
  const [cashCurrency, setCashCurrency] = useState("USD"); // "USD" | "KRW"
  const [cashAmount, setCashAmount] = useState("");
  const [cashExchangeRate, setCashExchangeRate] = useState("");
  const [confirmHovered, setConfirmHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const currencyBtnRefs = useRef([]);
  const [currencyIndicator, setCurrencyIndicator] = useState({ left: 0, width: 0 });
  const cashCurrencyBtnRefs = useRef([]);
  const [cashCurrencyIndicator, setCashCurrencyIndicator] = useState({ left: 0, width: 0 });

  // S&P500 지수(실시간) - 홈 탭 상단, 클릭 시 캔들차트 모달 (야후 파이낸스, API 키 불필요)
  const [snp500Index, setSnp500Index] = useState(null); // { name, price, date, changeAmount, changePercent, history }
  const [snp500IndexLoading, setSnp500IndexLoading] = useState(true);
  const [snp500IndexModalOpen, setSnp500IndexModalOpen] = useState(false);
  const [snp500IndexModalVisible, setSnp500IndexModalVisible] = useState(false);
  const [snp500IndexHovered, setSnp500IndexHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("nasdaq-index-proxy", { body: { symbol: "^GSPC", name: "S&P500" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSnp500Index(!error && data && data.price != null ? data : null);
        setSnp500IndexLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSnp500Index(null);
          setSnp500IndexLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openSnp500IndexModal = () => {
    setSnp500IndexModalOpen(true);
    requestAnimationFrame(() => setSnp500IndexModalVisible(true));
  };
  const closeSnp500IndexModal = () => {
    setSnp500IndexModalVisible(false);
    setTimeout(() => setSnp500IndexModalOpen(false), 300);
  };
  const closeSnp500IndexModalRef = useRef(closeSnp500IndexModal);
  closeSnp500IndexModalRef.current = closeSnp500IndexModal;

  // S&P500 모달의 캔들차트 (표기 주기: 1일/1주/3달/1년, 모달이 열려있거나 주기를 바꿀 때마다 재조회)
  const [snp500Period, setSnp500Period] = useState("1d");
  const [snp500Candles, setSnp500Candles] = useState([]);
  const [snp500CandlesLoading, setSnp500CandlesLoading] = useState(false);

  useEffect(() => {
    if (!snp500IndexModalOpen) return;
    let cancelled = false;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === snp500Period) || INDEX_CANDLE_PERIODS[0];
    setSnp500CandlesLoading(true);
    supabase.functions
      .invoke("nasdaq-index-proxy", {
        body: { symbol: "^GSPC", name: "S&P500", range: cfg.range, interval: cfg.interval },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSnp500Candles(!error && data && Array.isArray(data.history) ? data.history : []);
        setSnp500CandlesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSnp500Candles([]);
          setSnp500CandlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [snp500IndexModalOpen, snp500Period]);

  // 나스닥 종합지수(실시간) - 홈 탭 상단, 클릭 시 캔들차트 모달 (야후 파이낸스, API 키 불필요)
  const [nasdaqIndex, setNasdaqIndex] = useState(null); // { name, price, date, changeAmount, changePercent, history }
  const [nasdaqIndexLoading, setNasdaqIndexLoading] = useState(true);
  const [nasdaqIndexModalOpen, setNasdaqIndexModalOpen] = useState(false);
  const [nasdaqIndexModalVisible, setNasdaqIndexModalVisible] = useState(false);
  const [nasdaqIndexHovered, setNasdaqIndexHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("nasdaq-index-proxy", { body: { symbol: "^IXIC", name: "나스닥" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setNasdaqIndex(!error && data && data.price != null ? data : null);
        setNasdaqIndexLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setNasdaqIndex(null);
          setNasdaqIndexLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openNasdaqIndexModal = () => {
    setNasdaqIndexModalOpen(true);
    requestAnimationFrame(() => setNasdaqIndexModalVisible(true));
  };
  const closeNasdaqIndexModal = () => {
    setNasdaqIndexModalVisible(false);
    setTimeout(() => setNasdaqIndexModalOpen(false), 300);
  };
  const closeNasdaqIndexModalRef = useRef(closeNasdaqIndexModal);
  closeNasdaqIndexModalRef.current = closeNasdaqIndexModal;

  // 나스닥 모달의 캔들차트 (표기 주기: 1일/1주/3달/1년, 모달이 열려있거나 주기를 바꿀 때마다 재조회)
  const [nasdaqPeriod, setNasdaqPeriod] = useState("1d");
  const [nasdaqCandles, setNasdaqCandles] = useState([]);
  const [nasdaqCandlesLoading, setNasdaqCandlesLoading] = useState(false);

  useEffect(() => {
    if (!nasdaqIndexModalOpen) return;
    let cancelled = false;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === nasdaqPeriod) || INDEX_CANDLE_PERIODS[0];
    setNasdaqCandlesLoading(true);
    supabase.functions
      .invoke("nasdaq-index-proxy", {
        body: { symbol: "^IXIC", name: "나스닥", range: cfg.range, interval: cfg.interval },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setNasdaqCandles(!error && data && Array.isArray(data.history) ? data.history : []);
        setNasdaqCandlesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setNasdaqCandles([]);
          setNasdaqCandlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nasdaqIndexModalOpen, nasdaqPeriod]);

  // 코스피 지수(실시간) - 홈 탭 상단, 클릭 시 캔들차트 모달 (야후 파이낸스, API 키 불필요)
  const [kospiIndex, setKospiIndex] = useState(null); // { name, price, date, changeAmount, changePercent, history }
  const [kospiIndexLoading, setKospiIndexLoading] = useState(true);
  const [kospiIndexModalOpen, setKospiIndexModalOpen] = useState(false);
  const [kospiIndexModalVisible, setKospiIndexModalVisible] = useState(false);
  const [kospiIndexHovered, setKospiIndexHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("nasdaq-index-proxy", { body: { symbol: "^KS11", name: "코스피" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setKospiIndex(!error && data && data.price != null ? data : null);
        setKospiIndexLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setKospiIndex(null);
          setKospiIndexLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openKospiIndexModal = () => {
    setKospiIndexModalOpen(true);
    requestAnimationFrame(() => setKospiIndexModalVisible(true));
  };
  const closeKospiIndexModal = () => {
    setKospiIndexModalVisible(false);
    setTimeout(() => setKospiIndexModalOpen(false), 300);
  };
  const closeKospiIndexModalRef = useRef(closeKospiIndexModal);
  closeKospiIndexModalRef.current = closeKospiIndexModal;

  // 코스피 모달의 캔들차트 (표기 주기: 1일/1주/3달/1년, 모달이 열려있거나 주기를 바꿀 때마다 재조회)
  const [kospiPeriod, setKospiPeriod] = useState("1d");
  const [kospiCandles, setKospiCandles] = useState([]);
  const [kospiCandlesLoading, setKospiCandlesLoading] = useState(false);

  useEffect(() => {
    if (!kospiIndexModalOpen) return;
    let cancelled = false;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === kospiPeriod) || INDEX_CANDLE_PERIODS[0];
    setKospiCandlesLoading(true);
    supabase.functions
      .invoke("nasdaq-index-proxy", {
        body: { symbol: "^KS11", name: "코스피", range: cfg.range, interval: cfg.interval },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setKospiCandles(!error && data && Array.isArray(data.history) ? data.history : []);
        setKospiCandlesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setKospiCandles([]);
          setKospiCandlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kospiIndexModalOpen, kospiPeriod]);

  // 코스닥 지수(실시간) - 홈 탭 상단, 클릭 시 캔들차트 모달 (야후 파이낸스, API 키 불필요)
  const [kosdaqIndex, setKosdaqIndex] = useState(null); // { name, price, date, changeAmount, changePercent, history }
  const [kosdaqIndexLoading, setKosdaqIndexLoading] = useState(true);
  const [kosdaqIndexModalOpen, setKosdaqIndexModalOpen] = useState(false);
  const [kosdaqIndexModalVisible, setKosdaqIndexModalVisible] = useState(false);
  const [kosdaqIndexHovered, setKosdaqIndexHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("nasdaq-index-proxy", { body: { symbol: "^KQ11", name: "코스닥" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setKosdaqIndex(!error && data && data.price != null ? data : null);
        setKosdaqIndexLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setKosdaqIndex(null);
          setKosdaqIndexLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openKosdaqIndexModal = () => {
    setKosdaqIndexModalOpen(true);
    requestAnimationFrame(() => setKosdaqIndexModalVisible(true));
  };
  const closeKosdaqIndexModal = () => {
    setKosdaqIndexModalVisible(false);
    setTimeout(() => setKosdaqIndexModalOpen(false), 300);
  };
  const closeKosdaqIndexModalRef = useRef(closeKosdaqIndexModal);
  closeKosdaqIndexModalRef.current = closeKosdaqIndexModal;

  // 코스닥 모달의 캔들차트 (표기 주기: 1일/1주/3달/1년, 모달이 열려있거나 주기를 바꿀 때마다 재조회)
  const [kosdaqPeriod, setKosdaqPeriod] = useState("1d");
  const [kosdaqCandles, setKosdaqCandles] = useState([]);
  const [kosdaqCandlesLoading, setKosdaqCandlesLoading] = useState(false);

  useEffect(() => {
    if (!kosdaqIndexModalOpen) return;
    let cancelled = false;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === kosdaqPeriod) || INDEX_CANDLE_PERIODS[0];
    setKosdaqCandlesLoading(true);
    supabase.functions
      .invoke("nasdaq-index-proxy", {
        body: { symbol: "^KQ11", name: "코스닥", range: cfg.range, interval: cfg.interval },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setKosdaqCandles(!error && data && Array.isArray(data.history) ? data.history : []);
        setKosdaqCandlesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setKosdaqCandles([]);
          setKosdaqCandlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kosdaqIndexModalOpen, kosdaqPeriod]);

  // 지수 위젯 카드 하단 점 버튼으로 전환되는 두 페이지: 0 = 주가지수 4종, 1 = 환율/미국채
  const [indexPage, setIndexPage] = useState(0);

  // 지수 위젯 카드 내 좌우 드래그(스와이프)로도 점 버튼과 동일하게 페이지 전환
  const indexDragRef = useRef({ startX: 0, startY: 0, dragging: false, moved: false });
  const handleIndexDragStart = (e) => {
    const p = e.touches ? e.touches[0] : e;
    indexDragRef.current = { startX: p.clientX, startY: p.clientY, dragging: true, moved: false };
  };
  const handleIndexDragMove = (e) => {
    if (!indexDragRef.current.dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - indexDragRef.current.startX;
    const dy = p.clientY - indexDragRef.current.startY;
    if (!indexDragRef.current.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      indexDragRef.current.moved = true;
    }
  };
  const handleIndexDragEnd = (e) => {
    if (!indexDragRef.current.dragging) return;
    const p = e.changedTouches ? e.changedTouches[0] : e;
    const dx = p.clientX - indexDragRef.current.startX;
    indexDragRef.current.dragging = false;
    if (Math.abs(dx) > 40) {
      setIndexPage(dx < 0 ? 1 : 0);
    }
  };
  const handleIndexDragCancel = () => {
    indexDragRef.current.dragging = false;
  };
  // 드래그(스와이프)로 페이지가 전환된 경우, 뒤이어 발생하는 클릭이 위젯을 열지 않도록 차단
  const handleIndexClickCapture = (e) => {
    if (indexDragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      indexDragRef.current.moved = false;
    }
  };

  // 환율(원/달러, 원/엔) - 야후 파이낸스, 지수 위젯과 동일한 위젯+모달+캔들차트 구성
  const fxKrwUsd = useYahooIndex("KRW=X", "원/달러");
  const fxKrwJpy = useYahooIndex("JPYKRW=X", "원/엔");

  // 기준환율 (원화 자산을 달러로 환산할 때 사용) - 홈 탭과 동일한 야후 파이낸스 원/달러 시세를 그대로 사용
  const todayRate = fxKrwUsd.index?.price ?? 1300;

  // S&P500/나스닥100 선물 - 야후 파이낸스(E-mini 선물)
  const snp500Futures = useYahooIndex("ES=F", "S&P500 선물");
  const nasdaq100Futures = useYahooIndex("NQ=F", "나스닥100 선물");

  // 미국채 금리(3개월/5년/10년/30년) - 야후 파이낸스(CBOE 금리지수), 원시값이 실제 수익률(%) 그대로라 별도 보정 없음.
  // 1년물은 야후에 전용 티커가 없어 가장 근접한 단기물인 13주(3개월) 국채로 대체한다.
  const ust1y = useYahooIndex("^IRX", "미국채3개월");
  const ust5y = useYahooIndex("^FVX", "미국채5년");
  const ust10y = useYahooIndex("^TNX", "미국채10년");
  const ust30y = useYahooIndex("^TYX", "미국채30년");

  // 종목 정보 모달 (종목 클릭 시 표시, 야후 파이낸스로 지수 모달과 동일한 캔들차트 표시)
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoHolding, setInfoHolding] = useState(null);

  const openInfoModal = (originalIndex) => {
    const h = holdings[originalIndex];
    const derived = stockHoldings.find((sh) => sh.originalIndex === originalIndex);
    setInfoHolding({ ...h, ...derived });
    setInfoModalOpen(true);
    requestAnimationFrame(() => setInfoModalVisible(true));
  };

  const closeInfoModal = () => {
    setInfoModalVisible(false);
    setTimeout(() => setInfoModalOpen(false), 300);
  };
  const closeInfoModalRef = useRef(closeInfoModal);
  closeInfoModalRef.current = closeInfoModal;

  // 배당 캘린더 모달 (홈 탭 "연 배당" 카드 클릭 시 표시, 월별 배당금 막대그래프)
  const [dividendModalOpen, setDividendModalOpen] = useState(false);
  const [dividendModalVisible, setDividendModalVisible] = useState(false);

  const openDividendModal = () => {
    setDividendModalOpen(true);
    requestAnimationFrame(() => setDividendModalVisible(true));
  };

  const closeDividendModal = () => {
    setDividendModalVisible(false);
    setTimeout(() => setDividendModalOpen(false), 300);
  };
  const closeDividendModalRef = useRef(closeDividendModal);
  closeDividendModalRef.current = closeDividendModal;

  // 홈 탭 총자산/배당금 카드 표기 통화($/₩) 슬라이드 토글 - 총 자산, 배당금, 배당 캘린더 모달 표기 전부에 적용됨
  const [homeCurrency, setHomeCurrency] = useState("USD");
  const [homeCurrencyIndicator, setHomeCurrencyIndicator] = useState({ left: 0, width: 0 });
  const homeCurrencyBtnRefs = useRef([]);
  const [homeCurrencyHoverIdx, setHomeCurrencyHoverIdx] = useState(null);

  useEffect(() => {
    const idx = homeCurrency === "USD" ? 0 : 1;
    const el = homeCurrencyBtnRefs.current[idx];
    if (el) {
      setHomeCurrencyIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [homeCurrency, active]);

  // 자산 추이 모달 (홈 탭 "자산" 클릭 시 표시, 1일/1주/3달/1년 기간별 꺾은선 그래프)
  const [assetTrendModalOpen, setAssetTrendModalOpen] = useState(false);
  const [assetTrendModalVisible, setAssetTrendModalVisible] = useState(false);
  const [assetTrendPeriod, setAssetTrendPeriod] = useState("1d");
  const [assetTrendSeries, setAssetTrendSeries] = useState([]); // [{ ts, valueUSD }]
  const [assetTrendLoading, setAssetTrendLoading] = useState(false);

  const openAssetTrendModal = () => {
    setAssetTrendModalOpen(true);
    requestAnimationFrame(() => setAssetTrendModalVisible(true));
  };

  const closeAssetTrendModal = () => {
    setAssetTrendModalVisible(false);
    setTimeout(() => setAssetTrendModalOpen(false), 300);
  };
  const closeAssetTrendModalRef = useRef(closeAssetTrendModal);
  closeAssetTrendModalRef.current = closeAssetTrendModal;

  // 목표 모달 (홈 탭 "목표" 클릭 시 표시, 목표 설정일로부터 지금까지의 달성률(%) 추이 그래프)
  // goalTargetUSD/goalSetAt은 Supabase portfolios 테이블에 저장되어 기기 간 동기화된다.
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalTargetUSD, setGoalTargetUSD] = useState(0);
  const [goalSetAt, setGoalSetAt] = useState(null); // ISO 문자열
  const [goalProgressSeries, setGoalProgressSeries] = useState([]); // [{ ts, percent }]
  const [goalProgressLoading, setGoalProgressLoading] = useState(false);
  const [goalPeriod, setGoalPeriod] = useState("1d");
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const goalInputRef = useRef(null);

  const openGoalModal = () => {
    setGoalModalOpen(true);
    requestAnimationFrame(() => setGoalModalVisible(true));
  };

  const closeGoalModal = () => {
    setGoalModalVisible(false);
    setGoalEditing(false);
    setTimeout(() => setGoalModalOpen(false), 300);
  };
  const closeGoalModalRef = useRef(closeGoalModal);
  closeGoalModalRef.current = closeGoalModal;

  useEffect(() => {
    if (goalEditing) {
      requestAnimationFrame(() => goalInputRef.current && goalInputRef.current.focus());
    }
  }, [goalEditing]);

  // 벤치마크 목록 - 야후 파이낸스 심볼은 홈 탭 지수 위젯(S&P500/나스닥/코스피)과 동일하게 사용
  const BENCHMARK_OPTIONS = [
    { key: "sp500", label: "S&P500", symbol: "^GSPC" },
    { key: "nasdaq", label: "나스닥", symbol: "^IXIC" },
    { key: "kospi", label: "코스피", symbol: "^KS11" },
  ];

  // 벤치마크 모달 (홈 탭 "벤치마크" 클릭 시 표시, 선택한 지수 대비 내 포트폴리오 수익률 비교 차트)
  const [benchmarkModalOpen, setBenchmarkModalOpen] = useState(false);
  const [benchmarkModalVisible, setBenchmarkModalVisible] = useState(false);
  const [benchmarkPeriod, setBenchmarkPeriod] = useState("1d");
  const [selectedBenchmark, setSelectedBenchmark] = useState(BENCHMARK_OPTIONS[0].key);
  const [benchmarkListOpen, setBenchmarkListOpen] = useState(false);
  const [benchmarkSeries, setBenchmarkSeries] = useState([]); // [{ ts, portfolioReturn, benchmarkReturn }]
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const openBenchmarkModal = () => {
    setBenchmarkModalOpen(true);
    requestAnimationFrame(() => setBenchmarkModalVisible(true));
  };

  const closeBenchmarkModal = () => {
    setBenchmarkModalVisible(false);
    setBenchmarkListOpen(false);
    setTimeout(() => setBenchmarkModalOpen(false), 300);
  };
  const closeBenchmarkModalRef = useRef(closeBenchmarkModal);
  closeBenchmarkModalRef.current = closeBenchmarkModal;

  // 벤치마크 선택 리스트 버튼 바깥을 클릭하면 드롭다운을 닫는다
  const benchmarkListRef = useRef(null);
  useEffect(() => {
    if (!benchmarkListOpen) return;
    const handleClickOutside = (e) => {
      if (benchmarkListRef.current && !benchmarkListRef.current.contains(e.target)) {
        setBenchmarkListOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [benchmarkListOpen]);

  // 티커 → 야후 파이낸스 심볼 후보. 숫자 티커(국내 종목)는 코스피(.KS)를 먼저 시도하고,
  // 없으면 코스닥(.KQ)으로 재시도한다. 그 외(영문 등) 티커는 그대로 미국장 심볼로 사용한다.
  const yahooSymbolCandidates = (ticker) =>
    isNumericTicker(ticker) ? [`${ticker}.KS`, `${ticker}.KQ`] : [ticker];

  // 모달이 열리면 후보 심볼을 순서대로 시도해 실제로 시세가 있는 심볼을 찾는다 (헤더 현재가/등락 포함)
  const [infoSymbol, setInfoSymbol] = useState(null);
  const [infoCurrent, setInfoCurrent] = useState(null); // { name, price, changeAmount, changePercent }
  const [infoCurrentLoading, setInfoCurrentLoading] = useState(false);

  useEffect(() => {
    if (!infoModalOpen || !infoHolding) {
      setInfoSymbol(null);
      setInfoCurrent(null);
      return;
    }
    let cancelled = false;
    setInfoCurrentLoading(true);
    setInfoCurrent(null);
    setInfoSymbol(null);

    const resolveSymbol = async () => {
      for (const symbol of yahooSymbolCandidates(infoHolding.ticker)) {
        try {
          const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
            body: { symbol, name: infoHolding.name || infoHolding.ticker },
          });
          if (cancelled) return;
          if (!error && data && data.price != null) {
            setInfoSymbol(symbol);
            setInfoCurrent(data);
            setInfoCurrentLoading(false);
            return;
          }
        } catch (e) {
          // 다음 후보로 계속 시도
        }
      }
      if (!cancelled) setInfoCurrentLoading(false);
    };
    resolveSymbol();
    return () => {
      cancelled = true;
    };
  }, [infoModalOpen, infoHolding]);

  // 지수 모달과 동일한 캔들차트(1일/1주/3달/1년) - 해석된 심볼로 조회
  const [infoPeriod, setInfoPeriod] = useState("1d");
  const [infoCandles, setInfoCandles] = useState([]);
  const [infoCandlesLoading, setInfoCandlesLoading] = useState(false);

  useEffect(() => {
    if (!infoModalOpen || !infoSymbol) {
      setInfoCandles([]);
      return;
    }
    let cancelled = false;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === infoPeriod) || INDEX_CANDLE_PERIODS[0];
    setInfoCandlesLoading(true);
    supabase.functions
      .invoke("nasdaq-index-proxy", {
        body: { symbol: infoSymbol, name: infoHolding?.name || infoHolding?.ticker, range: cfg.range, interval: cfg.interval },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setInfoCandles(!error && data && Array.isArray(data.history) ? data.history : []);
        setInfoCandlesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setInfoCandles([]);
          setInfoCandlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [infoModalOpen, infoSymbol, infoPeriod]);

  // 모달(종목 추가/수정, 지수 차트, 터미널 명령어 패널)이 떠 있는 동안 배경 스크롤 방지
  useEffect(() => {
    const anyModalOpen =
      modalOpen ||
      infoModalOpen ||
      dividendModalOpen ||
      assetTrendModalOpen ||
      snp500IndexModalOpen ||
      nasdaqIndexModalOpen ||
      kospiIndexModalOpen ||
      kosdaqIndexModalOpen ||
      fxKrwUsd.modalOpen ||
      fxKrwJpy.modalOpen ||
      snp500Futures.modalOpen ||
      nasdaq100Futures.modalOpen ||
      ust1y.modalOpen ||
      ust5y.modalOpen ||
      ust10y.modalOpen ||
      ust30y.modalOpen ||
      chatOpen;
    if (anyModalOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [
    modalOpen,
    infoModalOpen,
    dividendModalOpen,
    assetTrendModalOpen,
    snp500IndexModalOpen,
    nasdaqIndexModalOpen,
    kospiIndexModalOpen,
    kosdaqIndexModalOpen,
    fxKrwUsd.modalOpen,
    fxKrwJpy.modalOpen,
    snp500Futures.modalOpen,
    nasdaq100Futures.modalOpen,
    ust1y.modalOpen,
    ust5y.modalOpen,
    ust10y.modalOpen,
    ust30y.modalOpen,
    chatOpen,
  ]);

  useEffect(() => {
    const idx = currency === "USD" ? 0 : 1;
    const el = currencyBtnRefs.current[idx];
    if (el) {
      setCurrencyIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [currency, modalOpen]);

  useEffect(() => {
    const idx = cashCurrency === "USD" ? 0 : 1;
    const el = cashCurrencyBtnRefs.current[idx];
    if (el) {
      setCashCurrencyIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [cashCurrency, modalOpen, assetType]);

  const resetForm = () => {
    setAssetType("stock");
    setTicker("");
    setStockName("");
    setQuantity("");
    setPrice("");
    setCurrency("KRW");
    setExchangeRate("");
    setCashCurrency("USD");
    setCashAmount("");
    setCashExchangeRate("");
  };

  const openModal = (type = "stock") => {
    setActive(1);
    resetForm();
    setAssetType(type);
    setEditIndex(null);
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  };

  const openEditModal = (type, index) => {
    setActive(1);
    if (type === "stock") {
      const h = holdings[index];
      setAssetType("stock");
      setTicker(h.ticker);
      setStockName(h.name || "");
      setQuantity(String(h.quantity));
      setPrice(String(h.avgPrice));
      setCurrency(h.currency);
      setExchangeRate(
        h.currency === "USD" && h.exchangeRate ? String(Math.round(h.exchangeRate)) : ""
      );
    } else {
      const c = cashHoldings[index];
      setAssetType("cash");
      setCashCurrency(c.currency);
      setCashAmount(String(c.amount));
      setCashExchangeRate(
        c.currency === "USD" && c.exchangeRate ? String(Math.round(c.exchangeRate)) : ""
      );
    }
    setEditIndex(index);
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  };

  const closeModal = () => {
    setModalVisible(false);
    setDeleteConfirming(false);
    setTimeout(() => {
      setModalOpen(false);
      setEditIndex(null);
    }, 300);
  };

  const [holdings, setHoldings] = useState([]); // [{ ticker, quantity, avgPrice, currency, exchangeRate }]
  const [cashHoldings, setCashHoldings] = useState([]); // [{ currency, amount, exchangeRate }]
  const [dataLoaded, setDataLoaded] = useState(false);

  // 숫자가 하나라도 포함된 티커는 국내(코스피/코스닥) 종목으로 취급 (예: 005930, 0198A0 같은
  // 영문 혼합 ETF 코드도 포함 - 미국 종목 티커는 숫자 없이 순수 영문으로만 구성됨)
  const isNumericTicker = (ticker) => /[0-9]/.test(ticker || "");

  // 보유 종목 현재가(수익률/현재 평가금액 계산용) - 야후 파이낸스로 조회. 숫자 티커(국내 종목)는
  // 코스피(.KS)를 먼저 시도하고 실패하면 코스닥(.KQ)으로 재시도하며, 그 외(영문) 티커는 그대로 조회한다.
  const [stockPrices, setStockPrices] = useState({}); // { [ticker]: currentPrice }
  // 최근 12개월 배당 지급 이력(종목 통화 기준 주당 배당금) - 현재가와 같은 요청으로 함께 받아온다.
  // 연 배당 %/예상 배당금 합산, 배당 캘린더(월별 막대그래프) 양쪽에 그대로 사용한다.
  const [dividendEvents, setDividendEvents] = useState({}); // { [ticker]: [{ ts, amount }] } (오래된 순 정렬, 최근 12개월만)
  const holdingsTickerKey = holdings.map((h) => h.ticker).join(",");

  useEffect(() => {
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    if (uniqueTickers.length === 0) {
      setStockPrices({});
      setDividendEvents({});
      return;
    }
    let cancelled = false;
    const oneYearAgoSec = Date.now() / 1000 - 365 * 24 * 60 * 60;

    const fetchOne = async (ticker) => {
      for (const symbol of yahooSymbolCandidates(ticker)) {
        try {
          const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
            body: { symbol, name: ticker, range: "1y", interval: "1mo" },
          });
          if (!error && data && data.price != null) {
            const dividends = Array.isArray(data.dividends) ? data.dividends : [];
            // 배당소득세 15% 원천징수를 반영해 세후(실수령) 금액으로 저장 - 이후 모든 배당 계산에 그대로 사용됨
            const recentDividends = dividends
              .filter((d) => d.ts >= oneYearAgoSec)
              .map((d) => ({ ts: d.ts, amount: (d.amount || 0) * (1 - DIVIDEND_TAX_RATE) }));
            return { price: data.price, dividends: recentDividends };
          }
        } catch (e) {
          // 다음 후보로 계속 시도
        }
      }
      return { price: null, dividends: [] };
    };

    Promise.all(uniqueTickers.map((ticker) => fetchOne(ticker).then((r) => [ticker, r]))).then(
      (results) => {
        if (cancelled) return;
        const nextPrices = {};
        const nextDividends = {};
        for (const [ticker, r] of results) {
          if (r.price != null) nextPrices[ticker] = r.price;
          nextDividends[ticker] = r.dividends;
        }
        setStockPrices(nextPrices);
        setDividendEvents(nextDividends);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [holdingsTickerKey]);

  // 방금 로드를 완료한 세션의 user_id (ref라서 렌더를 기다리지 않고 즉시 반영됨).
  // 토큰 자동 갱신 등으로 session 객체가 바뀌면 LOAD 이펙트가 이 값을 먼저 null로 초기화하는데,
  // 그 직후 같은 커밋에서 실행되는 SAVE 이펙트는 아직 리렌더되지 않은 이전 dataLoaded=true를
  // 볼 수 있다. SAVE 이펙트가 setDataLoaded(false) 반영(다음 렌더)을 기다리지 않고도 이 ref로
  // "지금 로드된 holdings가 실제로 이 세션 것인지"를 동기적으로 확인해, 로드 완료 전 값으로
  // 서버 데이터를 덮어쓰는 것을 막는다.
  const loadedForUserIdRef = useRef(null);

  // 로그인한 사용자의 Supabase portfolios 테이블에서 데이터 불러오기
  useEffect(() => {
    if (!session) {
      loadedForUserIdRef.current = null;
      setHoldings([]);
      setCashHoldings([]);
      setDataLoaded(false);
      setGoalTargetUSD(0);
      setGoalSetAt(null);
      return;
    }
    let cancelled = false;
    loadedForUserIdRef.current = null;
    setDataLoaded(false);

    // 중요: 불러오기가 "성공"했을 때만 로드 완료(ref + dataLoaded)로 표시한다.
    // 세션이 오래 유휴 상태였다가 다시 살아나는 순간(토큰 재발급 직후)엔 GET이 일시적으로
    // 실패(401/네트워크)할 수 있는데, 이때 로드 완료로 잘못 표시하면 방금 SIGNED_OUT에서
    // []로 비워진 로컬 holdings가 그대로 저장되어 서버 데이터를 덮어쓴다(데이터 소실).
    // 따라서 에러 시엔 저장을 계속 차단한 채 잠시 후 재시도한다.
    const MAX_ATTEMPTS = 5;
    const attemptLoad = (attempt) => {
      supabase
        .from("portfolios")
        .select("holdings, cash_holdings, goal_amount, goal_set_at")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error(`포트폴리오 불러오기 실패(시도 ${attempt}/${MAX_ATTEMPTS}):`, error.message);
            if (attempt < MAX_ATTEMPTS) {
              // 지수 백오프로 재시도 (로드 완료로 표시하지 않아 저장은 계속 차단됨)
              setTimeout(() => {
                if (!cancelled) attemptLoad(attempt + 1);
              }, Math.min(1000 * 2 ** (attempt - 1), 8000));
            }
            // 모든 재시도 실패 시에도 로드 완료로 표시하지 않는다 - 데이터를 지키는 게 우선.
            return;
          }
          // 성공(data가 null이어도 = 아직 행이 없는 신규 사용자, 정상). 이때만 로드 완료 처리.
          if (data) {
            if (Array.isArray(data.holdings)) setHoldings(data.holdings);
            if (Array.isArray(data.cash_holdings)) setCashHoldings(data.cash_holdings);
            setGoalTargetUSD(typeof data.goal_amount === "number" ? data.goal_amount : 0);
            setGoalSetAt(data.goal_set_at || null);
          }
          loadedForUserIdRef.current = session.user.id;
          setDataLoaded(true);
        });
    };
    attemptLoad(1);

    return () => {
      cancelled = true;
    };
  }, [session]);

  // holdings / cashHoldings 변경 시마다 Supabase에 저장 (최초 로드 완료 이후에만)
  // onConflict를 명시하지 않으면 upsert가 테이블 기본키(id)를 충돌 기준으로 삼는데,
  // 이 저장 로직은 id를 넘기지 않으므로 user_id 유니크 제약과 충돌해 갱신이 실패하거나
  // (제약이 없으면) 매번 새 행이 쌓여 다른 기기에서 데이터를 못 찾는 문제가 생긴다.
  useEffect(() => {
    if (!dataLoaded || !session || loadedForUserIdRef.current !== session.user.id) return;
    supabase
      .from("portfolios")
      .upsert(
        {
          user_id: session.user.id,
          holdings,
          cash_holdings: cashHoldings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(({ error }) => {
        if (error) console.error("포트폴리오 저장 실패:", error.message);
      });
  }, [holdings, cashHoldings, dataLoaded, session]);

  // 서브 액션바 알림 (리퀴드 글래스, 탭바 바로 위) - 닉네임 저장/프로모션 코드 등 공용
  const [subActionNotice, setSubActionNotice] = useState(false);
  const [subActionVisible, setSubActionVisible] = useState(false);
  const [subActionText, setSubActionText] = useState("");
  const [subActionIsError, setSubActionIsError] = useState(false);

  const showSubActionNotice = (text, isError = false) => {
    setSubActionText(text);
    setSubActionIsError(isError);
    setSubActionNotice(true);
    requestAnimationFrame(() => setSubActionVisible(true));
    setTimeout(() => {
      setSubActionVisible(false);
      setTimeout(() => setSubActionNotice(false), 300);
    }, 1800);
  };

  // 닉네임 (Supabase profiles 테이블)
  const [nickname, setNickname] = useState("");
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const nicknameInputRef = useRef(null);

  useEffect(() => {
    if (!session) {
      setNickname("");
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("nickname")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data && data.nickname) {
          setNickname(data.nickname);
        } else {
          setNickname((session.user.email || "").split("@")[0]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (nicknameEditing) {
      requestAnimationFrame(() => nicknameInputRef.current && nicknameInputRef.current.focus());
    }
  }, [nicknameEditing]);

  const startEditingNickname = () => {
    setNicknameDraft(nickname);
    setNicknameEditing(true);
  };

  // 목표 금액 수정 시작 - 현재 선택된 통화(homeCurrency)로 환산된 값을 입력창 초깃값으로 채운다
  const startEditingGoal = () => {
    setGoalDraft(
      goalTargetUSD > 0
        ? String(Math.round(homeCurrency === "USD" ? goalTargetUSD : goalTargetUSD * todayRate))
        : ""
    );
    setGoalEditing(true);
  };

  // 목표 금액 저장 - 확인 버튼 없이 입력을 완료(포커스 아웃/Enter)하면 즉시 USD로 환산해 Supabase에 저장한다.
  // 최초 설정 시에만 goalSetAt(달성률 추이 그래프의 시작일)을 지금 시각으로 기록하고, 이후 수정 시에는 유지한다.
  const saveGoal = async (value) => {
    setGoalEditing(false);
    if (!session) return;
    const num = parseFloat(String(value).replace(/,/g, ""));
    if (!num || num <= 0) {
      // 금액을 비우거나 0을 입력하면 통화(달러/원)와 무관하게 목표를 제거한다.
      if (!(goalTargetUSD > 0)) return;
      setGoalTargetUSD(0);
      setGoalSetAt(null);
      const { error } = await supabase.from("portfolios").upsert(
        {
          user_id: session.user.id,
          goal_amount: null,
          goal_set_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) {
        showSubActionNotice("삭제 실패했습니다", true);
        return;
      }
      showSubActionNotice("목표가 삭제되었습니다");
      return;
    }
    const targetUSD = homeCurrency === "USD" ? num : num / todayRate;
    const isFirstGoal = !goalSetAt;
    const setAtIso = isFirstGoal ? new Date().toISOString() : goalSetAt;
    setGoalTargetUSD(targetUSD);
    if (isFirstGoal) setGoalSetAt(setAtIso);
    const { error } = await supabase.from("portfolios").upsert(
      {
        user_id: session.user.id,
        goal_amount: targetUSD,
        goal_set_at: setAtIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      showSubActionNotice("저장 실패했습니다", true);
      return;
    }
    showSubActionNotice("저장되었습니다");
  };

  const saveNickname = async (value) => {
    const trimmed = value.trim();
    setNicknameEditing(false);
    if (!trimmed || trimmed === nickname || !session) return;
    setNickname(trimmed);
    await supabase.from("profiles").upsert(
      {
        user_id: session.user.id,
        nickname: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    showSubActionNotice("저장 되었습니다");
  };

  const handleConfirm = () => {
    if (assetType === "cash") {
      const amountNum = parseFloat(cashAmount);
      const cashRateNum = parseFloat(cashExchangeRate);
      const validCashRate =
        isFinite(cashRateNum) && cashRateNum > 0 ? cashRateNum : todayRate;

      if (!isFinite(amountNum) || amountNum <= 0) {
        closeModal();
        return;
      }

      if (editIndex !== null) {
        // 수정 모드: 해당 항목 값만 덮어쓰기
        setCashHoldings((prev) => {
          const updated = [...prev];
          updated[editIndex] = {
            currency: cashCurrency,
            amount: amountNum,
            exchangeRate: cashCurrency === "USD" ? validCashRate : null,
          };
          return updated;
        });
        closeModal();
        return;
      }

      setCashHoldings((prev) => {
        const idx = prev.findIndex((c) => c.currency === cashCurrency);
        if (idx >= 0) {
          const existing = prev[idx];
          const newAmount = existing.amount + amountNum;
          const newRate =
            cashCurrency === "USD"
              ? ((existing.exchangeRate || validCashRate) * existing.amount +
                  validCashRate * amountNum) /
                newAmount
              : null;
          const updated = [...prev];
          updated[idx] = { ...existing, amount: newAmount, exchangeRate: newRate };
          return updated;
        }
        return [
          ...prev,
          {
            currency: cashCurrency,
            amount: amountNum,
            exchangeRate: cashCurrency === "USD" ? validCashRate : null,
          },
        ];
      });
      closeModal();
      return;
    }

    const t = ticker.trim().toUpperCase();
    const name = stockName.trim();
    const qtyNum = parseFloat(quantity);
    const priceNum = parseFloat(price);
    const rateNum = parseFloat(exchangeRate);
    const validRate = isFinite(rateNum) && rateNum > 0 ? rateNum : todayRate;

    if (!t || !isFinite(qtyNum) || qtyNum <= 0 || !isFinite(priceNum) || priceNum <= 0) {
      closeModal();
      return;
    }

    if (editIndex !== null) {
      // 수정 모드: 해당 항목 값만 덮어쓰기 (합산 없음)
      setHoldings((prev) => {
        const updated = [...prev];
        updated[editIndex] = {
          ticker: t,
          name,
          quantity: qtyNum,
          avgPrice: priceNum,
          currency,
          exchangeRate: currency === "USD" ? validRate : null,
        };
        return updated;
      });
      closeModal();
      return;
    }

    setHoldings((prev) => {
      const idx = prev.findIndex((h) => h.ticker === t);
      if (idx >= 0) {
        // 동일 티커: 수량 합산 + 가중평균 단가(및 구매시점 환율) 자동 계산
        const existing = prev[idx];
        const newQty = existing.quantity + qtyNum;
        const newAvgPrice =
          (existing.avgPrice * existing.quantity + priceNum * qtyNum) / newQty;
        const newRate =
          currency === "USD"
            ? ((existing.exchangeRate || validRate) * existing.quantity +
                validRate * qtyNum) /
              newQty
            : null;
        const updated = [...prev];
        updated[idx] = {
          ...existing,
          name: name || existing.name,
          quantity: newQty,
          avgPrice: newAvgPrice,
          exchangeRate: newRate,
        };
        return updated;
      }
      return [
        ...prev,
        {
          ticker: t,
          name,
          quantity: qtyNum,
          avgPrice: priceNum,
          currency,
          exchangeRate: currency === "USD" ? validRate : null,
        },
      ];
    });

    closeModal();
  };

  // ESC로 취소, ENTER로 확인 (모달/명령어 입력창 공통)
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;
  const handleConfirmRef = useRef(handleConfirm);
  handleConfirmRef.current = handleConfirm;
  const toggleChatRef = useRef(toggleChat);
  toggleChatRef.current = toggleChat;
  const handleChatSendRef = useRef(handleChatSend);
  handleChatSendRef.current = handleChatSend;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (infoModalOpen) {
          e.preventDefault();
          closeInfoModalRef.current();
        } else if (dividendModalOpen) {
          e.preventDefault();
          closeDividendModalRef.current();
        } else if (assetTrendModalOpen) {
          e.preventDefault();
          closeAssetTrendModalRef.current();
        } else if (goalModalOpen) {
          e.preventDefault();
          closeGoalModalRef.current();
        } else if (benchmarkModalOpen) {
          e.preventDefault();
          closeBenchmarkModalRef.current();
        } else if (snp500IndexModalOpen) {
          e.preventDefault();
          closeSnp500IndexModalRef.current();
        } else if (nasdaqIndexModalOpen) {
          e.preventDefault();
          closeNasdaqIndexModalRef.current();
        } else if (kospiIndexModalOpen) {
          e.preventDefault();
          closeKospiIndexModalRef.current();
        } else if (kosdaqIndexModalOpen) {
          e.preventDefault();
          closeKosdaqIndexModalRef.current();
        } else if (fxKrwUsd.modalOpen) {
          e.preventDefault();
          fxKrwUsd.closeRef.current();
        } else if (fxKrwJpy.modalOpen) {
          e.preventDefault();
          fxKrwJpy.closeRef.current();
        } else if (snp500Futures.modalOpen) {
          e.preventDefault();
          snp500Futures.closeRef.current();
        } else if (nasdaq100Futures.modalOpen) {
          e.preventDefault();
          nasdaq100Futures.closeRef.current();
        } else if (ust1y.modalOpen) {
          e.preventDefault();
          ust1y.closeRef.current();
        } else if (ust5y.modalOpen) {
          e.preventDefault();
          ust5y.closeRef.current();
        } else if (ust10y.modalOpen) {
          e.preventDefault();
          ust10y.closeRef.current();
        } else if (ust30y.modalOpen) {
          e.preventDefault();
          ust30y.closeRef.current();
        } else if (modalOpen) {
          e.preventDefault();
          closeModalRef.current();
        } else if (pendingCommand) {
          e.preventDefault();
          setPendingCommand(null);
        } else if (chatDoneNotice) {
          e.preventDefault();
          setChatDoneNotice(false);
        } else if (chatSortMode) {
          e.preventDefault();
          setChatSortMode(false);
        } else if (chatOpen) {
          e.preventDefault();
          toggleChatRef.current();
        }
      } else if (e.key === "Enter") {
        if (modalOpen) {
          e.preventDefault();
          handleConfirmRef.current();
        } else if (chatOpen) {
          e.preventDefault();
          handleChatSendRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    modalOpen,
    infoModalOpen,
    dividendModalOpen,
    assetTrendModalOpen,
    snp500IndexModalOpen,
    nasdaqIndexModalOpen,
    kospiIndexModalOpen,
    kosdaqIndexModalOpen,
    fxKrwUsd.modalOpen,
    fxKrwJpy.modalOpen,
    snp500Futures.modalOpen,
    nasdaq100Futures.modalOpen,
    ust1y.modalOpen,
    ust5y.modalOpen,
    ust10y.modalOpen,
    ust30y.modalOpen,
    chatOpen,
    chatSortMode,
    pendingCommand,
    chatDoneNotice,
  ]);

  // 삭제 버튼 클릭 - 첫 클릭은 확인 상태로 전환만 하고, 확인 상태에서 다시 누르면 실제로 삭제한다.
  const handleDeleteClick = () => {
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }
    if (editIndex === null) {
      closeModal();
      return;
    }
    if (assetType === "cash") {
      setCashHoldings((prev) => prev.filter((_, i) => i !== editIndex));
    } else {
      setHoldings((prev) => prev.filter((_, i) => i !== editIndex));
    }
    setDeleteConfirming(false);
    closeModal();
  };

  // 확인 상태로 전환된 후 일정 시간(3초) 안에 다시 누르지 않으면 실수 방지를 위해 자동으로 해제
  useEffect(() => {
    if (!deleteConfirming) return;
    const timer = setTimeout(() => setDeleteConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [deleteConfirming]);

  // 같은 카테고리 내 종목 순서 변경 (드래그 앤 드롭)
  const handleDragStart = (key, index) => (e) => {
    setDraggedInfo({ key, index });
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(index));
    } catch (err) {}
  };

  const handleDragOver = (key, index) => (e) => {
    if (!draggedInfo || draggedInfo.key !== key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (key, index) => (e) => {
    e.preventDefault();
    if (!draggedInfo || draggedInfo.key !== key || draggedInfo.index === index) {
      setDraggedInfo(null);
      setDragOverIndex(null);
      return;
    }
    const reorder = (arr) => {
      const copy = [...arr];
      const [moved] = copy.splice(draggedInfo.index, 1);
      copy.splice(index, 0, moved);
      return copy;
    };
    if (key === "stocks") {
      setHoldings((prev) => reorder(prev));
    } else {
      setCashHoldings((prev) => reorder(prev));
    }
    setDraggedInfo(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedInfo(null);
    setDragOverIndex(null);
  };

  // 원 단위/센트를 상황에 맞게 표시
  const formatAmount = (num, curr) => {
    const symbol = curr === "USD" ? "$" : "₩";
    const rounded =
      curr === "USD"
        ? Math.round(num * 100) / 100
        : Math.round(num);
    return symbol + rounded.toLocaleString(undefined, {
      maximumFractionDigits: curr === "USD" ? 2 : 0,
    });
  };

  // 종목 상세 모달의 현재가/평균단가 표기: 티커가 숫자(국내 종목)면 소수점 없이,
  // 영문(미국 종목)이면 소수점 첫째 자리까지만 표기
  const formatStockPrice = (num, ticker, curr) => {
    const symbol = curr === "USD" ? "$" : "₩";
    const digits = isNumericTicker(ticker) ? 0 : 1;
    return symbol + num.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  // 종목 리스트의 손익 금액 표기: 통화 기호 없이, 위와 동일한 소수점 규칙(국내 종목 없음/미국 종목 1자리)
  const formatGainAmount = (num, ticker) => {
    const digits = isNumericTicker(ticker) ? 0 : 1;
    return Math.abs(num).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const palette = ["#8FA7FF", "#F2A65A", "#7FD8A6", "#E97C7C", "#B58EF2", "#5FC6D9"];
  const cashPalette = ["#9CA3AF", "#6B7280"];

  // 원그래프 비중(%) 계산은 항상 USD 기준: 원화 자산만 기준환율로 환산
  const toUSD = (h) =>
    h.currency === "USD" ? h.avgPrice * h.quantity : (h.avgPrice * h.quantity) / todayRate;

  const cashToUSD = (c) =>
    c.currency === "USD" ? c.amount : c.amount / todayRate;

  // 터미널 /sort 명령어: 이름/비중/수량 기준 자동 정렬
  const handleSortSelect = (criteria) => {
    setHoldings((prev) => {
      const sorted = [...prev];
      sorted.sort((a, b) => {
        if (criteria === "name") return a.ticker.localeCompare(b.ticker);
        if (criteria === "quantity") return b.quantity - a.quantity;
        return toUSD(b) - toUSD(a);
      });
      return sorted;
    });
    setCashHoldings((prev) => {
      const sorted = [...prev];
      sorted.sort((a, b) => {
        if (criteria === "name") return a.currency.localeCompare(b.currency);
        return cashToUSD(b) - cashToUSD(a);
      });
      return sorted;
    });
  };

  // 터미널 /target [티커] [%] 명령어: 목표 비중 달성에 필요한 추가 매수/매도 금액 계산
  // 현금은 기준환율(todayRate)로 환산
  const computeTargetResult = async (ticker, percent) => {
    if (!isFinite(percent) || percent < 0 || percent >= 100) {
      return "목표 비중은 0~100 사이의 숫자로 입력해주세요";
    }
    const grandTotalUSD = holdings.reduce((s, h) => s + toUSD(h), 0) + cashHoldings.reduce((s, c) => s + cashToUSD(c), 0);
    const stockIdx = holdings.findIndex((h) => h.ticker.toLowerCase() === ticker.toLowerCase());
    const cashIdx = stockIdx === -1 ? cashHoldings.findIndex((c) => c.currency.toLowerCase() === ticker.toLowerCase()) : -1;

    if (stockIdx === -1 && cashIdx === -1) {
      return "종목을 찾을 수 없습니다";
    }

    const currentUSD = stockIdx !== -1 ? toUSD(holdings[stockIdx]) : cashToUSD(cashHoldings[cashIdx]);
    const targetFraction = percent / 100;
    const diffUSD = (targetFraction * grandTotalUSD - currentUSD) / (1 - targetFraction);
    const isSell = diffUSD < 0;
    const absUSD = Math.abs(diffUSD);
    const action = isSell ? "매도" : "매수";

    if (stockIdx !== -1) {
      const h = holdings[stockIdx];
      const absInCurrency = h.currency === "USD" ? absUSD : absUSD * todayRate;
      return `${ticker} 목표 ${percent}% 달성을 위해 ${formatAmount(absInCurrency, h.currency)} 추가 ${action} 필요합니다`;
    }

    const c = cashHoldings[cashIdx];
    const absInCurrency = c.currency === "USD" ? absUSD : absUSD * todayRate;
    return `${ticker} 목표 ${percent}% 달성을 위해 ${formatAmount(absInCurrency, c.currency)} 추가 ${action} 필요합니다`;
  };

  const handleSortSelectRef = useRef(handleSortSelect);
  handleSortSelectRef.current = handleSortSelect;
  const computeTargetResultRef = useRef(computeTargetResult);
  computeTargetResultRef.current = computeTargetResult;

  // 명령어 선택/입력 후 빠른 타이핑 효과로 2초간 실행 안내 표기 -> 실제 명령 실행 -> 결과 안내
  useEffect(() => {
    if (!pendingCommand) return;
    setRunningTypedCount(0);
    const totalChars = COMMAND_RUNNING_TEXT.length;
    const typeDuration = 700;
    const charInterval = typeDuration / totalChars;
    let i = 0;
    const typeTimer = setInterval(() => {
      i++;
      setRunningTypedCount(i);
      if (i >= totalChars) clearInterval(typeTimer);
    }, charInterval);

    const execTimer = setTimeout(() => {
      setRunningTypedCount(0);
      setChatSortMode(false);
      setSortHoverIdx(null);
      setChatMessage("");
      setPendingCommand(null);
      if (pendingCommand.kind === "sort") {
        handleSortSelectRef.current(pendingCommand.criteria);
        setChatDoneText("완료했습니다");
        setChatDoneNotice(true);
      } else if (pendingCommand.kind === "target") {
        // /target 결과는 자동으로 사라지지 않고 입력창 자리에 일반 텍스트로 유지됨 (주식 현재가 조회는 비동기)
        computeTargetResultRef
          .current(pendingCommand.ticker, pendingCommand.percent)
          .then((resultText) => setTargetNoticeText(resultText));
      }
    }, 2000);

    return () => {
      clearInterval(typeTimer);
      clearTimeout(execTimer);
    };
  }, [pendingCommand]);

  // 결과 안내를 빠른 타이핑 효과로 표기 후 원래 입력창으로 복귀
  useEffect(() => {
    if (!chatDoneNotice) return;
    setDoneTypedCount(0);
    const totalChars = chatDoneText.length;
    const typeDuration = Math.min(1200, totalChars * 25);
    const charInterval = typeDuration / totalChars;
    let i = 0;
    const typeTimer = setInterval(() => {
      i++;
      setDoneTypedCount(i);
      if (i >= totalChars) clearInterval(typeTimer);
    }, charInterval);

    const holdDuration = Math.min(6000, Math.max(1500, totalChars * 70));
    const resetTimer = setTimeout(() => {
      setChatDoneNotice(false);
      setDoneTypedCount(0);
    }, holdDuration);

    return () => {
      clearInterval(typeTimer);
      clearTimeout(resetTimer);
    };
  }, [chatDoneNotice, chatDoneText]);

  const totalStockValueUSD = holdings.reduce((sum, h) => sum + toUSD(h), 0);
  const totalCashValueUSD = cashHoldings.reduce((sum, c) => sum + cashToUSD(c), 0);
  const grandTotalUSD = totalStockValueUSD + totalCashValueUSD;

  // 통화별 원래 금액 그대로 합산 (환산 없이)
  const totalNativeUSD =
    holdings
      .filter((h) => h.currency === "USD")
      .reduce((sum, h) => sum + h.avgPrice * h.quantity, 0) +
    cashHoldings
      .filter((c) => c.currency === "USD")
      .reduce((sum, c) => sum + c.amount, 0);

  const totalNativeKRW =
    holdings
      .filter((h) => h.currency === "KRW")
      .reduce((sum, h) => sum + h.avgPrice * h.quantity, 0) +
    cashHoldings
      .filter((c) => c.currency === "KRW")
      .reduce((sum, c) => sum + c.amount, 0);

  // 달러 자산 → 원화 환산: 각 자산에 기입했던 개별 환율 사용
  const convertedUSDtoKRW =
    holdings
      .filter((h) => h.currency === "USD")
      .reduce((sum, h) => sum + h.avgPrice * h.quantity * (h.exchangeRate || todayRate), 0) +
    cashHoldings
      .filter((c) => c.currency === "USD")
      .reduce((sum, c) => sum + c.amount * (c.exchangeRate || todayRate), 0);

  // 원화 자산 → 달러 환산: 아래 입력하는 기준환율 사용
  const convertedKRWtoUSD = totalNativeKRW / todayRate;

  // 화면에 표기할 통화별(각각) 총자산: 자기 통화 원금액 + 다른 통화 자산의 환산액
  const displayTotalUSD = totalNativeUSD + convertedKRWtoUSD;
  const displayTotalKRW = totalNativeKRW + convertedUSDtoKRW;

  // 총 자산 등락폭: 현재가가 있는 보유 종목의 평가손익(현재가 - 평균단가) × 수량을 합산 (현금은 손익이 없어 제외)
  let totalGainUSD = 0;
  let totalCostBasisUSD = 0;
  holdings.forEach((h) => {
    const currentPrice = stockPrices[h.ticker];
    if (!isFinite(currentPrice) || currentPrice <= 0) return;
    const gainNative = (currentPrice - h.avgPrice) * h.quantity;
    const costNative = h.avgPrice * h.quantity;
    const gainUSD = h.currency === "USD" ? gainNative : gainNative / todayRate;
    const costUSD = h.currency === "USD" ? costNative : costNative / todayRate;
    totalGainUSD += gainUSD;
    totalCostBasisUSD += costUSD;
  });
  const totalGainKRW = totalGainUSD * todayRate;
  const totalGainPercent = totalCostBasisUSD > 0 ? (totalGainUSD / totalCostBasisUSD) * 100 : 0;

  // 최근 12개월 주당 배당금 합계(종목 통화 기준) - 배당 이력 이벤트를 종목별로 합산
  const dividendPerShare = {};
  for (const ticker of Object.keys(dividendEvents)) {
    dividendPerShare[ticker] = (dividendEvents[ticker] || []).reduce((sum, d) => sum + (d.amount || 0), 0);
  }

  // 연 배당 예상치: 보유 종목별 최근 12개월 주당 배당금 × 수량을 종목 통화로 계산한 뒤 기준환율로 합산
  const annualDividendUSD = holdings.reduce((sum, h) => {
    const nativeAmount = (dividendPerShare[h.ticker] || 0) * h.quantity;
    const usd = h.currency === "USD" ? nativeAmount : nativeAmount / todayRate;
    return sum + usd;
  }, 0);
  const annualDividendKRW = annualDividendUSD * todayRate;
  const annualDividendYieldPercent = grandTotalUSD > 0 ? (annualDividendUSD / grandTotalUSD) * 100 : 0;

  // 목표 달성률(%): 총 자산(USD) ÷ 목표 금액(USD) × 100. 목표 미설정 시 0.
  const goalProgressPercent = goalTargetUSD > 0 ? (grandTotalUSD / goalTargetUSD) * 100 : 0;

  // 자산 추이: 보유 종목별 과거 시세(야후 파이낸스 캔들 히스토리)에 수량을 곱해 시점별 평가금액을 복원하고,
  // 현금(시점에 따라 변하지 않는다고 가정한 현재 평가액)을 더해 전체 자산의 시간별 추이를 근사한다.
  // 여러 종목의 타임스탬프가 정확히 일치하지 않을 수 있어, 데이터가 가장 많은 종목의 타임스탬프를 기준으로
  // 각 종목에서 가장 가까운 시각의 종가를 찾아 합산한다. 환율은 현재 기준환율을 모든 시점에 동일하게 적용한다.
  useEffect(() => {
    if (!assetTrendModalOpen) return;
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    if (uniqueTickers.length === 0) {
      setAssetTrendSeries([]);
      return;
    }
    let cancelled = false;
    setAssetTrendLoading(true);
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === assetTrendPeriod) || INDEX_CANDLE_PERIODS[0];

    const fetchOne = async (ticker) => {
      for (const symbol of yahooSymbolCandidates(ticker)) {
        try {
          const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
            body: { symbol, name: ticker, range: cfg.range, interval: cfg.interval },
          });
          if (!error && data && Array.isArray(data.history) && data.history.length > 0) {
            return data.history;
          }
        } catch (e) {
          // 다음 후보로 계속 시도
        }
      }
      return [];
    };

    Promise.all(uniqueTickers.map((ticker) => fetchOne(ticker).then((history) => [ticker, history]))).then(
      (results) => {
        if (cancelled) return;
        const historyByTicker = {};
        for (const [ticker, history] of results) historyByTicker[ticker] = history;

        let referenceTicker = null;
        let maxLen = 0;
        for (const ticker of uniqueTickers) {
          const len = (historyByTicker[ticker] || []).length;
          if (len > maxLen) {
            maxLen = len;
            referenceTicker = ticker;
          }
        }
        if (!referenceTicker) {
          setAssetTrendSeries([]);
          setAssetTrendLoading(false);
          return;
        }

        const closestClose = (history, ts) => {
          if (!history || history.length === 0) return null;
          let best = history[0];
          let bestDiff = Math.abs(history[0].ts - ts);
          for (const p of history) {
            const diff = Math.abs(p.ts - ts);
            if (diff < bestDiff) {
              best = p;
              bestDiff = diff;
            }
          }
          return best.close;
        };

        const series = historyByTicker[referenceTicker].map((refPoint) => {
          let totalUSD = totalCashValueUSD;
          holdings.forEach((h) => {
            const close = closestClose(historyByTicker[h.ticker], refPoint.ts);
            if (close == null) return;
            const nativeValue = close * h.quantity;
            totalUSD += h.currency === "USD" ? nativeValue : nativeValue / todayRate;
          });
          return { ts: refPoint.ts, valueUSD: totalUSD };
        });

        setAssetTrendSeries(series);
        setAssetTrendLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [assetTrendModalOpen, assetTrendPeriod, holdingsTickerKey]);

  // 목표 달성률 추이: 자산 추이와 동일한 방식(보유 종목별 과거 시세 복원 + 현재 현금 평가액 가산)으로
  // 선택한 기간(1일/1주/3달/1년) 동안의 총 자산 평가금액을 구한 뒤, 목표 금액 대비 퍼센트로 환산한다.
  useEffect(() => {
    if (!goalModalOpen || !(goalTargetUSD > 0)) {
      setGoalProgressSeries([]);
      return;
    }
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    if (uniqueTickers.length === 0) {
      setGoalProgressSeries([]);
      return;
    }

    let cancelled = false;
    setGoalProgressLoading(true);
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === goalPeriod) || INDEX_CANDLE_PERIODS[0];

    const fetchOne = async (ticker) => {
      for (const symbol of yahooSymbolCandidates(ticker)) {
        try {
          const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
            body: { symbol, name: ticker, range: cfg.range, interval: cfg.interval },
          });
          if (!error && data && Array.isArray(data.history) && data.history.length > 0) {
            return data.history;
          }
        } catch (e) {
          // 다음 후보로 계속 시도
        }
      }
      return [];
    };

    Promise.all(uniqueTickers.map((ticker) => fetchOne(ticker).then((history) => [ticker, history]))).then(
      (results) => {
        if (cancelled) return;
        const historyByTicker = {};
        for (const [ticker, history] of results) historyByTicker[ticker] = history;

        let referenceTicker = null;
        let maxLen = 0;
        for (const ticker of uniqueTickers) {
          const len = (historyByTicker[ticker] || []).length;
          if (len > maxLen) {
            maxLen = len;
            referenceTicker = ticker;
          }
        }
        if (!referenceTicker) {
          setGoalProgressSeries([]);
          setGoalProgressLoading(false);
          return;
        }

        const closestClose = (history, ts) => {
          if (!history || history.length === 0) return null;
          let best = history[0];
          let bestDiff = Math.abs(history[0].ts - ts);
          for (const p of history) {
            const diff = Math.abs(p.ts - ts);
            if (diff < bestDiff) {
              best = p;
              bestDiff = diff;
            }
          }
          return best.close;
        };

        const series = historyByTicker[referenceTicker].map((refPoint) => {
          let totalUSD = totalCashValueUSD;
          holdings.forEach((h) => {
            const close = closestClose(historyByTicker[h.ticker], refPoint.ts);
            if (close == null) return;
            const nativeValue = close * h.quantity;
            totalUSD += h.currency === "USD" ? nativeValue : nativeValue / todayRate;
          });
          return { ts: refPoint.ts, percent: (totalUSD / goalTargetUSD) * 100 };
        });

        setGoalProgressSeries(series);
        setGoalProgressLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [goalModalOpen, goalTargetUSD, goalPeriod, holdingsTickerKey]);

  // 벤치마크 비교: 선택한 지수(예: S&P500)의 과거 시세와, 자산 추이와 동일한 방식으로 복원한 내 포트폴리오
  // 평가금액을 지수의 타임스탬프 축에 맞춰 함께 구한 뒤, 각각 기간 시작 시점 대비 수익률(%)로 환산해 겹쳐 비교한다.
  useEffect(() => {
    if (!benchmarkModalOpen || !(grandTotalUSD > 0)) {
      setBenchmarkSeries([]);
      return;
    }
    const benchmarkSymbol =
      BENCHMARK_OPTIONS.find((b) => b.key === selectedBenchmark)?.symbol || BENCHMARK_OPTIONS[0].symbol;
    const cfg = INDEX_CANDLE_PERIODS.find((p) => p.key === benchmarkPeriod) || INDEX_CANDLE_PERIODS[0];
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];

    let cancelled = false;
    setBenchmarkLoading(true);

    const fetchHistory = async (symbol) => {
      try {
        const { data, error } = await supabase.functions.invoke("nasdaq-index-proxy", {
          body: { symbol, name: symbol, range: cfg.range, interval: cfg.interval },
        });
        if (!error && data && Array.isArray(data.history)) return data.history;
      } catch (e) {
        // 무시하고 빈 배열 반환
      }
      return [];
    };

    const fetchOneHolding = async (ticker) => {
      for (const symbol of yahooSymbolCandidates(ticker)) {
        const history = await fetchHistory(symbol);
        if (history.length > 0) return history;
      }
      return [];
    };

    Promise.all([
      fetchHistory(benchmarkSymbol),
      Promise.all(uniqueTickers.map((ticker) => fetchOneHolding(ticker).then((history) => [ticker, history]))),
    ]).then(([benchmarkHistory, holdingResults]) => {
      if (cancelled) return;
      if (benchmarkHistory.length === 0) {
        setBenchmarkSeries([]);
        setBenchmarkLoading(false);
        return;
      }
      const historyByTicker = {};
      for (const [ticker, history] of holdingResults) historyByTicker[ticker] = history;

      const closestClose = (history, ts) => {
        if (!history || history.length === 0) return null;
        let best = history[0];
        let bestDiff = Math.abs(history[0].ts - ts);
        for (const p of history) {
          const diff = Math.abs(p.ts - ts);
          if (diff < bestDiff) {
            best = p;
            bestDiff = diff;
          }
        }
        return best.close;
      };

      const portfolioValueAt = (ts) => {
        let totalUSD = totalCashValueUSD;
        holdings.forEach((h) => {
          const close = closestClose(historyByTicker[h.ticker], ts);
          if (close == null) return;
          const nativeValue = close * h.quantity;
          totalUSD += h.currency === "USD" ? nativeValue : nativeValue / todayRate;
        });
        return totalUSD;
      };

      const benchmarkBaseClose = benchmarkHistory[0].close;
      const portfolioBaseUSD = portfolioValueAt(benchmarkHistory[0].ts);

      const series = benchmarkHistory.map((point) => {
        const portfolioUSD = portfolioValueAt(point.ts);
        const benchmarkReturn = benchmarkBaseClose ? ((point.close - benchmarkBaseClose) / benchmarkBaseClose) * 100 : 0;
        const portfolioReturn = portfolioBaseUSD > 0 ? ((portfolioUSD - portfolioBaseUSD) / portfolioBaseUSD) * 100 : 0;
        return { ts: point.ts, benchmarkReturn, portfolioReturn };
      });

      setBenchmarkSeries(series);
      setBenchmarkLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [benchmarkModalOpen, benchmarkPeriod, selectedBenchmark, holdingsTickerKey]);

  // 문자열을 해시하여 팔레트 인덱스를 고정적으로 결정 (정렬 순서와 무관하게 항상 같은 색상)
  const hashToIndex = (str, length) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash % length;
  };

  // 종목별 색상: 해시로 우선 배정하되, 이미 다른 보유 종목이 같은 색을 쓰고 있으면
  // 팔레트 내 비어있는 다음 색상으로 넘겨 색이 겹치지 않도록 함 (팔레트보다 종목이 많으면 중복 허용)
  const stockColorByTicker = {};
  {
    const usedColorIdx = new Set();
    holdings.forEach((h) => {
      let idx = hashToIndex(h.ticker, palette.length);
      if (usedColorIdx.has(idx)) {
        for (let offset = 1; offset < palette.length; offset++) {
          const candidate = (idx + offset) % palette.length;
          if (!usedColorIdx.has(candidate)) {
            idx = candidate;
            break;
          }
        }
      }
      usedColorIdx.add(idx);
      stockColorByTicker[h.ticker] = palette[idx];
    });
  }

  // 배당 캘린더(월별 막대그래프)용 데이터: 최근 12개월 배당 이벤트를 지급된 달(1~12월)별로 묶어
  // 종목별 배당금(선택된 표기 통화로 환산, 종목당 수량 반영)을 쌓는다. 막대 색상은 원그래프와 동일한 종목 색상을 사용.
  const dividendTickerNames = {};
  holdings.forEach((h) => {
    if (!dividendTickerNames[h.ticker]) dividendTickerNames[h.ticker] = h.name || h.ticker;
  });

  // 종목별 "지금까지 지급한 배당금의 평균값"(세후, 주당) - 아직 지나지 않은 달의 예상치 계산에 사용
  const dividendAveragePerShare = {};
  holdings.forEach((h) => {
    if (dividendAveragePerShare[h.ticker] !== undefined) return;
    const events = dividendEvents[h.ticker] || [];
    dividendAveragePerShare[h.ticker] =
      events.length > 0 ? events.reduce((sum, d) => sum + (d.amount || 0), 0) / events.length : 0;
  });

  // 종목별 배당 지급 주기(개월) 추정 - 배당 이벤트 간 평균 간격(일)을 월배당(1)/분기배당(3)/반기배당(6)/연배당(12)
  // 중 가장 가까운 주기로 매핑한다. QQQ처럼 분기 배당인 종목이 예상 배당금 계산에서 매달 지급되는 것으로
  // 잘못 표기되지 않도록, 지난 달이 아닌 미래 달의 예상치는 이 주기에 맞는 달에만 채워 넣는다.
  const DIVIDEND_INTERVAL_CANDIDATES = [
    { months: 1, days: 30 },
    { months: 3, days: 91 },
    { months: 6, days: 182 },
    { months: 12, days: 365 },
  ];
  const dividendIntervalMonths = {};
  const dividendLastEventMonth = {};
  holdings.forEach((h) => {
    if (dividendIntervalMonths[h.ticker] !== undefined) return;
    const events = dividendEvents[h.ticker] || [];
    const sorted = [...events].sort((a, b) => a.ts - b.ts);
    dividendLastEventMonth[h.ticker] =
      sorted.length > 0 ? new Date(sorted[sorted.length - 1].ts * 1000).getMonth() : null;
    if (sorted.length < 2) {
      dividendIntervalMonths[h.ticker] = 1;
      return;
    }
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].ts - sorted[i - 1].ts) / 86400);
    }
    const avgGapDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    let best = 1;
    let bestDiff = Infinity;
    DIVIDEND_INTERVAL_CANDIDATES.forEach(({ months, days }) => {
      const diff = Math.abs(avgGapDays - days);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = months;
      }
    });
    dividendIntervalMonths[h.ticker] = best;
  });

  const currentMonthIdx = new Date().getMonth(); // 0-based(1월=0). 이 달까지는 "이미 지난 달"로 취급

  const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  const dividendMonthlyData = MONTH_LABELS.map((label, monthIdx) => {
    const entry = { month: label, __estimates: {} };
    const isFutureMonth = monthIdx > currentMonthIdx;
    holdings.forEach((h) => {
      const events = dividendEvents[h.ticker] || [];
      if (events.length === 0) return;

      let amountPerShare;
      if (isFutureMonth) {
        // 아직 지나지 않은 달: 지급 주기상 실제로 배당이 발생할 달에만 평균 배당금으로 예상치 표기
        const interval = dividendIntervalMonths[h.ticker] || 1;
        const lastEventMonth = dividendLastEventMonth[h.ticker];
        const isCycleMonth = lastEventMonth == null || (monthIdx - lastEventMonth + 12) % interval === 0;
        amountPerShare = isCycleMonth ? dividendAveragePerShare[h.ticker] || 0 : 0;
      } else {
        // 이미 지난 달(이번 달 포함): 실제 지급된 배당금
        amountPerShare = events
          .filter((d) => new Date(d.ts * 1000).getMonth() === monthIdx)
          .reduce((sum, d) => sum + (d.amount || 0), 0);
      }
      if (amountPerShare <= 0) return;

      const nativeAmount = amountPerShare * h.quantity;
      const convertedAmount =
        homeCurrency === "USD"
          ? h.currency === "USD"
            ? nativeAmount
            : nativeAmount / todayRate
          : h.currency === "USD"
          ? nativeAmount * todayRate
          : nativeAmount;
      entry[h.ticker] = (entry[h.ticker] || 0) + convertedAmount;
      if (isFutureMonth) entry.__estimates[h.ticker] = true;
    });
    return entry;
  });

  // 실제로 배당이 찍힌 종목만 막대 스택/범례에 포함 (보유 순서 유지, 중복 제거)
  const dividendActiveTickers = [...new Set(holdings.map((h) => h.ticker))].filter((ticker) =>
    dividendMonthlyData.some((m) => (m[ticker] || 0) > 0)
  );

  const stockHoldings = holdings.map((h, i) => {
    const value = h.avgPrice * h.quantity; // 원가 기준 (총 자산 계산에는 이 값을 그대로 사용)
    const usdValue = toUSD(h);
    const percent =
      grandTotalUSD > 0 ? Math.round((usdValue / grandTotalUSD) * 100) : 0;
    const currentPrice = stockPrices[h.ticker];
    const hasCurrentPrice = isFinite(currentPrice) && currentPrice > 0;
    const gainAmount = hasCurrentPrice ? (currentPrice - h.avgPrice) * h.quantity : null;
    const returnPercent = hasCurrentPrice && h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : null;
    // 표기용 금액은 현재가가 있으면 현재 평가금액(현재가 × 수량), 없으면 원가로 대체
    const displayValue = hasCurrentPrice ? currentPrice * h.quantity : value;
    return {
      ticker: h.ticker,
      name: h.name || "",
      currency: h.currency,
      avgPrice: h.avgPrice,
      currentPrice: hasCurrentPrice ? currentPrice : null,
      gainAmount,
      returnPercent,
      percent,
      value: formatAmount(displayValue, h.currency),
      shares: `${h.quantity.toLocaleString()}주`,
      color: stockColorByTicker[h.ticker],
      originalIndex: i,
    };
  });

  const cashItems = cashHoldings.map((c, i) => {
    const usdValue = cashToUSD(c);
    const percent =
      grandTotalUSD > 0 ? Math.round((usdValue / grandTotalUSD) * 100) : 0;
    return {
      currency: c.currency,
      percent,
      amount: formatAmount(c.amount, c.currency),
      color: cashPalette[hashToIndex(c.currency, cashPalette.length)],
      originalIndex: i,
    };
  });

  const portfolio = {
    stocks: { label: "주식", holdings: stockHoldings, accent: "#8FA7FF" },
    cash: { label: "현금", holdings: cashItems, accent: "#4A4E58" },
  };

  const isEmpty = stockHoldings.length === 0 && cashItems.length === 0;

  const chartData = !isEmpty
    ? [
        ...stockHoldings.map((h) => ({
          name: h.ticker,
          value: h.percent,
          color: h.color,
          quantity: h.shares,
          amount: h.value,
        })),
        ...cashItems.map((c) => ({
          name: c.currency,
          value: c.percent,
          color: c.color,
          quantity: "현금",
          amount: c.amount,
        })),
      ]
    : [{ name: "빈 포트폴리오", value: 1, color: "#3A3D45", quantity: "", amount: "" }];

  // 원그래프 호버/터치 시 리퀴드 글래스 팝업
  const PieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      if (!d.quantity) return null;
      return (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            background: "rgba(40, 42, 48, 0.55)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: (isLight ? "1px solid rgba(20,22,26,0.14)" : "1px solid rgba(255,255,255,0.14)"),
            boxShadow: "0 8px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", marginBottom: 3 }}>
            {d.name}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
            {d.quantity}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
            {d.amount}
          </div>
        </div>
      );
    }
    return null;
  };

  // 배당 캘린더(월별 막대그래프) 툴팁: 호버한 달에 어떤 종목이 얼마씩 배당했는지 나열
  const DividendMonthTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const items = payload.filter((p) => p.value > 0);
    if (items.length === 0) return null;
    const total = items.reduce((sum, p) => sum + p.value, 0);
    return (
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 14,
          background: "rgba(40, 42, 48, 0.55)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: isLight ? "1px solid rgba(20,22,26,0.14)" : "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 }}>{label}</div>
        {items.map((p) => {
          const isEstimate = !!p.payload?.__estimates?.[p.dataKey];
          return (
            <div
              key={p.dataKey}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 2 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
              <span style={{ color: "rgba(255,255,255,0.75)" }}>{dividendTickerNames[p.dataKey] || p.dataKey}</span>
              <span style={{ marginLeft: "auto", fontWeight: 600, color: "#FFFFFF" }}>
                {formatAmount(p.value, homeCurrency)}
                {isEstimate && (
                  <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.55)" }}> (예상)</span>
                )}
              </span>
            </div>
          );
        })}
        {items.length > 1 && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 4,
              borderTop: "1px solid rgba(255,255,255,0.14)",
              fontSize: 12,
              fontWeight: 700,
              color: "#FFFFFF",
              textAlign: "right",
            }}
          >
            {formatAmount(total, homeCurrency)}
          </div>
        )}
      </div>
    );
  };

  // 자산 추이 모달 툴팁: "07/17(금) $2,500" 한 줄로 날짜(요일) + 평가금액 표기
  const AssetTrendTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    const displayValue = homeCurrency === "USD" ? d.valueUSD : d.valueUSD * todayRate;
    return (
      <div
        style={{
          background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
          border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          padding: "6px 10px",
          color: isLight ? "#14161A" : "#FFFFFF",
          whiteSpace: "nowrap",
        }}
      >
        {formatKstDatePart(d.ts)} {formatAmount(displayValue, homeCurrency)}
      </div>
    );
  };

  // 자산 추이 그래프 색상: 기간 시작 대비 마지막 값이 올랐으면 빨강(상승), 내렸으면 파랑(하락)
  const assetTrendColor =
    assetTrendSeries.length >= 2 &&
    assetTrendSeries[assetTrendSeries.length - 1].valueUSD < assetTrendSeries[0].valueUSD
      ? "#4D9FFF"
      : "#FF5C5C";

  // 목표 모달 툴팁: "07/17(금) 50.5%" 한 줄로 날짜(요일) + 달성률 표기 (분/시간봉 기간이면 시각도 추가)
  const GoalProgressTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    return (
      <div
        style={{
          background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
          border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          padding: "6px 10px",
          color: isLight ? "#14161A" : "#FFFFFF",
          whiteSpace: "nowrap",
        }}
      >
        {formatKstDatePart(d.ts)} {d.percent.toFixed(1)}%
      </div>
    );
  };

  // 벤치마크 비교 차트 색상: 내 포트폴리오 = 앱 기본 강조색, 벤치마크 지수 = 대비되는 보조색
  const BENCHMARK_PORTFOLIO_COLOR = "#8FA7FF";
  const BENCHMARK_INDEX_COLOR = "#FFB067";

  // 벤치마크 모달 툴팁: "07/17(금) 내 포트폴리오 +3.2% · S&P500 +1.8%" 한 줄로 표기
  const BenchmarkTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    const benchmarkLabel = BENCHMARK_OPTIONS.find((b) => b.key === selectedBenchmark)?.label || "지수";
    return (
      <div
        style={{
          background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
          border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          padding: "6px 10px",
          color: isLight ? "#14161A" : "#FFFFFF",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ marginBottom: 2 }}>{formatKstDatePart(d.ts)}</div>
        <div style={{ color: BENCHMARK_PORTFOLIO_COLOR }}>
          내 포트폴리오 {d.portfolioReturn >= 0 ? "+" : ""}
          {d.portfolioReturn.toFixed(2)}%
        </div>
        <div style={{ color: BENCHMARK_INDEX_COLOR }}>
          {benchmarkLabel} {d.benchmarkReturn >= 0 ? "+" : ""}
          {d.benchmarkReturn.toFixed(2)}%
        </div>
      </div>
    );
  };

  const BAR_HEIGHT = 58;

  // 입력값에 천 단위 콤마를 실시간으로 적용/해제하는 헬퍼
  const formatWithCommas = (str) => {
    if (str === "" || str === null || str === undefined) return "";
    const [intPart, decPart] = String(str).split(".");
    const sign = intPart.startsWith("-") ? "-" : "";
    const digits = intPart.replace("-", "");
    const formattedInt = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decPart !== undefined
      ? `${sign}${formattedInt}.${decPart}`
      : `${sign}${formattedInt}`;
  };

  const handleNumericChange = (setter) => (e) => {
    const raw = e.target.value.replace(/,/g, "");
    if (/^\d*\.?\d*$/.test(raw)) {
      setter(raw);
    }
  };

  const dotStyle = {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: (isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)"),
    display: "block",
  };

  const fieldLabelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: (isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)"),
    marginBottom: 7,
  };

  // 상단 헤더(제목 + 테마/추가 버튼) 스티키 공통 스타일: 스크롤해도 화면 최상단에
  // 계속 고정되어 보이고 눌려야 하므로, 탭 콘텐츠의 좌우 패딩을 상쇄하는 음수
  // 마진으로 배경을 화면 끝까지 채워 뒤에 스크롤되는 콘텐츠를 가려줌
  const stickyHeaderStyle = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "0 -20px 24px -20px",
    padding: "22px 20px 14px 20px",
    background: isLight ? "rgba(248,249,250,0.45)" : "rgba(23,25,29,0.45)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
  };

  const inputStyle = {
    width: "100%",
    height: 42,
    padding: "0 14px",
    marginBottom: 16,
    borderRadius: 12,
    border: (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"),
    background: (isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)"),
    color: (isLight ? "#14161A" : "#FFFFFF"),
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
    transition: "background 0.25s ease, border 0.25s ease",
  };

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: vh,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isLight ? "#F8F9FA" : "#17191D",
          color: isLight ? "#14161A" : "#FFFFFF",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        불러오는 중...
      </div>
    );
  }

  if (!session) {
    return (
      <div
        style={{
          minHeight: vh,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isLight ? "#F8F9FA" : "#17191D",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <form
          onSubmit={handleAuthSubmit}
          style={{
            width: "min(320px, 100%)",
            padding: "28px 22px",
            borderRadius: 22,
            background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          <h1
            style={{
              margin: "0 0 2px 0",
              fontSize: 22,
              fontWeight: 700,
              color: isLight ? "#14161A" : "#FFFFFF",
              letterSpacing: 0.2,
            }}
          >
            αlloy
          </h1>
          <h2
            style={{
              margin: isReturningSession && authMode === "signIn" ? "0 0 4px 0" : "0 0 20px 0",
              fontSize: 15,
              fontWeight: 600,
              color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
            }}
          >
            {authMode === "signUp" ? "회원가입" : "로그인"}
          </h2>
          {isReturningSession && authMode === "signIn" && (
            <div
              style={{
                margin: "0 0 16px 0",
                fontSize: 12,
                lineHeight: 1.5,
                color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
              }}
            >
              세션이 만료되었어요. 다시 로그인하면 저장해둔 자산이 그대로 나타나요.
            </div>
          )}

          <label style={fieldLabelStyle}>이메일</label>
          <input
            type="email"
            required
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            style={inputStyle}
          />

          <label style={fieldLabelStyle}>비밀번호</label>
          <input
            type="password"
            required
            minLength={6}
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            style={inputStyle}
          />

          {authError && (
            <div style={{ fontSize: 12, color: "rgba(255,138,138,0.9)", marginBottom: 12 }}>
              {authError}
            </div>
          )}
          {authNotice && (
            <div
              style={{
                fontSize: 12,
                color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
                marginBottom: 12,
              }}
            >
              {authNotice}
            </div>
          )}

          <button
            type="submit"
            disabled={authSubmitting}
            style={{
              width: "100%",
              height: 42,
              borderRadius: 12,
              border: `1px solid ${isLight ? "rgba(20,22,26,0.2)" : "rgba(255,255,255,0.2)"}`,
              background: isLight ? "rgba(20,22,26,0.18)" : "rgba(255,255,255,0.18)",
              color: isLight ? "#14161A" : "#FFFFFF",
              fontSize: 14,
              fontWeight: 600,
              cursor: authSubmitting ? "default" : "pointer",
              outline: "none",
              opacity: authSubmitting ? 0.6 : 1,
              marginBottom: 14,
            }}
          >
            {authMode === "signUp" ? "가입하기" : "로그인"}
          </button>

          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)",
            }}
          >
            {authMode === "signUp" ? "이미 계정이 있으신가요?" : "계정이 없으신가요?"}{" "}
            <span
              onClick={() => {
                setAuthMode((m) => (m === "signUp" ? "signIn" : "signUp"));
                setAuthError("");
                setAuthNotice("");
              }}
              style={{
                cursor: "pointer",
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
              }}
            >
              {authMode === "signUp" ? "로그인" : "회원가입"}
            </span>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: vh,
        width: "100%",
        position: "relative",
        zIndex: 0,
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* 문서 전체 여백 제거 및 배경색 강제 적용 */}
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          min-height: 100%;
          background: ${isLight ? "#F8F9FA" : "#17191D"};
        }
        .recharts-wrapper, .recharts-surface, .recharts-sector,
        .recharts-pie-sector, .recharts-layer {
          outline: none !important;
        }
        .recharts-wrapper svg:focus,
        .recharts-surface:focus,
        .recharts-sector:focus,
        .recharts-pie-sector:focus,
        .recharts-layer:focus {
          outline: none !important;
        }
      `}</style>

      {/* 전체 화면을 항상 덮는 고정 배경 레이어. 선셋/포레스트 테마는 다크 배경에 색상을 섞은 원형 그라데이션 (이스터에그) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            theme === "sunset" || theme === "forest"
              ? THEME_SWATCHES[theme]
              : THEME_SWATCHES[isLight ? "light" : "dark"],
          zIndex: -1,
          transition: "background 0.3s ease",
        }}
      />

      {/* 탭 콘텐츠 영역 */}
      <div
        style={{
          minHeight: vh,
          width: "100%",
          boxSizing: "border-box",
          padding: "0 20px 140px 20px",
        }}
      >
        {active === 0 && (
          <>
            {/* 상단 헤더: 제목 + 테마 토글 (스크롤해도 화면 상단에 고정) */}
            <div style={stickyHeaderStyle}>
              <div>
                <h1
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: 22,
                    fontWeight: 700,
                    color: (isLight ? "#14161A" : "#FFFFFF"),
                    letterSpacing: 0.2,
                  }}
                >
                  αlloy
                </h1>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 700,
                    color: (isLight ? "#14161A" : "#FFFFFF"),
                    letterSpacing: 0.2,
                  }}
                >
                  대시보드
                </h1>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* 라이트/다크 모드 토글 (리퀴드 글래스 원형 버튼) */}
                <button
                  onClick={() => {
                    toggleTheme();
                    setThemeHovered(false);
                  }}
                  onMouseEnter={() => setThemeHovered(true)}
                  onMouseLeave={() => setThemeHovered(false)}
                  aria-label="테마 전환"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: isLight
                      ? "1px solid rgba(20,22,26,0.12)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: themeHovered
                      ? isLight
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.14)"
                      : isLight
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: themeHovered
                      ? isLight
                        ? "0 6px 20px rgba(20,22,26,0.14), inset 0 1px 0 rgba(255,255,255,0.6)"
                        : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : isLight
                      ? "0 4px 14px rgba(20,22,26,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    transition:
                      "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: themeHovered ? "scale(1.08)" : "scale(1)",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={isLight ? "#14161A" : "#FFFFFF"}
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 지수 위젯 카드: 하단 점 버튼 또는 좌우 드래그(스와이프)로 "주가지수 4종" / "환율·미국채" 두 페이지 전환.
                두 페이지를 가로로 나란히 두고 translateX로 슬라이드시키는 방식이라, 두 페이지 모두 항상 DOM에 떠있으며
                내용이 더 큰 쪽 높이에 flex stretch로 맞춰져 카드 테두리 세로폭이 두 페이지에서 항상 동일하다. */}
            <div
              onMouseDown={handleIndexDragStart}
              onMouseMove={handleIndexDragMove}
              onMouseUp={handleIndexDragEnd}
              onMouseLeave={handleIndexDragCancel}
              onTouchStart={handleIndexDragStart}
              onTouchMove={handleIndexDragMove}
              onTouchEnd={handleIndexDragEnd}
              onClickCapture={handleIndexClickCapture}
              style={{
                marginTop: 56,
                padding: "20px 16px 16px",
                borderRadius: 24,
                border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
                touchAction: "pan-y",
                userSelect: "none",
                cursor: "grab",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "200%",
                  transform: `translateX(${indexPage === 0 ? "0%" : "-50%"})`,
                  transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {/* 1페이지: 지수 위젯(S&P500, 나스닥, 코스피, 코스닥) - 클릭 시 각각 캔들차트 모달 */}
                <div style={{ width: "50%", minWidth: 0, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 36,
                    }}
                  >
                    {[
                      {
                        key: "snp500",
                        loading: snp500IndexLoading,
                        index: snp500Index,
                        hovered: snp500IndexHovered,
                        setHovered: setSnp500IndexHovered,
                        open: openSnp500IndexModal,
                      },
                      {
                        key: "nasdaq",
                        loading: nasdaqIndexLoading,
                        index: nasdaqIndex,
                        hovered: nasdaqIndexHovered,
                        setHovered: setNasdaqIndexHovered,
                        open: openNasdaqIndexModal,
                      },
                    ].map((w) =>
                      w.loading ? (
                        <span
                          key={w.key}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                          }}
                        >
                          지수 불러오는 중...
                        </span>
                      ) : !w.index ? (
                        <span
                          key={w.key}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                          }}
                        >
                          지수 정보를 불러올 수 없어요
                        </span>
                      ) : (
                        <div
                          key={w.key}
                          onClick={w.open}
                          onMouseEnter={() => w.setHovered(true)}
                          onMouseLeave={() => w.setHovered(false)}
                          role="button"
                          tabIndex={0}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            cursor: "pointer",
                            opacity: w.hovered ? 0.7 : 1,
                            transition: "opacity 0.2s ease",
                            outline: "none",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
                            }}
                          >
                            {w.index.name}
                          </span>
                          <span
                            style={{
                              fontSize: 26,
                              fontWeight: 700,
                              color: isLight ? "#14161A" : "#FFFFFF",
                              letterSpacing: 0.2,
                            }}
                          >
                            {w.index.price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          {w.index.changeAmount != null && w.index.changePercent != null && (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: w.index.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                              }}
                            >
                              {w.index.changeAmount >= 0 ? "▲ " : "▼ "}
                              {Math.abs(w.index.changeAmount).toFixed(2)} (
                              {w.index.changePercent >= 0 ? "+" : ""}
                              {w.index.changePercent.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 36,
                      marginTop: 24,
                    }}
                  >
                    {[
                      {
                        key: "kospi",
                        loading: kospiIndexLoading,
                        index: kospiIndex,
                        hovered: kospiIndexHovered,
                        setHovered: setKospiIndexHovered,
                        open: openKospiIndexModal,
                      },
                      {
                        key: "kosdaq",
                        loading: kosdaqIndexLoading,
                        index: kosdaqIndex,
                        hovered: kosdaqIndexHovered,
                        setHovered: setKosdaqIndexHovered,
                        open: openKosdaqIndexModal,
                      },
                    ].map((w) =>
                      w.loading ? (
                        <span
                          key={w.key}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                          }}
                        >
                          지수 불러오는 중...
                        </span>
                      ) : !w.index ? (
                        <span
                          key={w.key}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                          }}
                        >
                          지수 정보를 불러올 수 없어요
                        </span>
                      ) : (
                        <div
                          key={w.key}
                          onClick={w.open}
                          onMouseEnter={() => w.setHovered(true)}
                          onMouseLeave={() => w.setHovered(false)}
                          role="button"
                          tabIndex={0}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            cursor: "pointer",
                            opacity: w.hovered ? 0.7 : 1,
                            transition: "opacity 0.2s ease",
                            outline: "none",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
                            }}
                          >
                            {w.index.name}
                          </span>
                          <span
                            style={{
                              fontSize: 26,
                              fontWeight: 700,
                              color: isLight ? "#14161A" : "#FFFFFF",
                              letterSpacing: 0.2,
                            }}
                          >
                            {w.index.price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          {w.index.changeAmount != null && w.index.changePercent != null && (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: w.index.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                              }}
                            >
                              {w.index.changeAmount >= 0 ? "▲ " : "▼ "}
                              {Math.abs(w.index.changeAmount).toFixed(2)} (
                              {w.index.changePercent >= 0 ? "+" : ""}
                              {w.index.changePercent.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* 2페이지: S&P500 선물/나스닥100 선물(1행), 원/달러·원/엔(2행), 미국채(3개월/5년, 10년/30년)를
                    가로 2열 세로 4열 그리드로 배치 - 선물끼리, 환율끼리, 국채끼리 각각 한 행에 나란히 표기.
                    셀 사이 구분선 없이 간격만으로 배치하고, 각 셀은 "이름 가격" 한 줄 + "화살표 등락폭(등락률%)" 한 줄로 표기 */}
                <div style={{ width: "50%", minWidth: 0, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      rowGap: 14,
                      columnGap: 6,
                      width: "72%",
                      margin: "0 auto",
                    }}
                  >
                    {[
                      { key: "snp500Futures", ...snp500Futures },
                      { key: "nasdaq100Futures", ...nasdaq100Futures },
                      { key: "fxKrwUsd", ...fxKrwUsd },
                      { key: "fxKrwJpy", ...fxKrwJpy },
                      { key: "ust1y", ...ust1y },
                      { key: "ust5y", ...ust5y },
                      { key: "ust10y", ...ust10y },
                      { key: "ust30y", ...ust30y },
                    ].map((w, i) => {
                      const cellStyle = {
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                      };
                      if (!w) return <div key={`index-grid-empty-${i}`} style={cellStyle} />;
                      return (
                        <div
                          key={w.key}
                          onClick={!w.loading && w.index ? w.open : undefined}
                          onMouseEnter={() => w.setHovered(true)}
                          onMouseLeave={() => w.setHovered(false)}
                          role="button"
                          tabIndex={0}
                          style={{
                            ...cellStyle,
                            cursor: !w.loading && w.index ? "pointer" : "default",
                            opacity: w.hovered ? 0.7 : 1,
                            transition: "opacity 0.2s ease",
                            outline: "none",
                          }}
                        >
                          {w.loading ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                              }}
                            >
                              불러오는 중...
                            </span>
                          ) : !w.index ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                              }}
                            >
                              정보 없음
                            </span>
                          ) : (
                            <>
                              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", gap: 5 }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
                                  }}
                                >
                                  {w.index.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: isLight ? "#14161A" : "#FFFFFF",
                                  }}
                                >
                                  {w.index.price.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              {w.index.changeAmount != null && w.index.changePercent != null && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: w.index.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                                  }}
                                >
                                  {w.index.changeAmount >= 0 ? "▲ " : "▼ "}
                                  {Math.abs(w.index.changeAmount).toFixed(2)} (
                                  {w.index.changePercent >= 0 ? "+" : ""}
                                  {w.index.changePercent.toFixed(2)}%)
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 페이지 전환 점 버튼: 첫번째 = 주가지수 4종, 두번째 = 환율·미국채 그리드 */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setIndexPage(0)}
                  aria-label="주가지수 4종 보기"
                  style={{
                    width: 7,
                    height: 7,
                    padding: 0,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    outline: "none",
                    background:
                      indexPage === 0
                        ? isLight
                          ? "#14161A"
                          : "#FFFFFF"
                        : isLight
                        ? "rgba(20,22,26,0.2)"
                        : "rgba(255,255,255,0.2)",
                    transition: "background 0.2s ease",
                  }}
                />
                <button
                  onClick={() => setIndexPage(1)}
                  aria-label="환율·미국채 보기"
                  style={{
                    width: 7,
                    height: 7,
                    padding: 0,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    outline: "none",
                    background:
                      indexPage === 1
                        ? isLight
                          ? "#14161A"
                          : "#FFFFFF"
                        : isLight
                        ? "rgba(20,22,26,0.2)"
                        : "rgba(255,255,255,0.2)",
                    transition: "background 0.2s ease",
                  }}
                />
              </div>
            </div>

            {/* 총 자산(투자 탭과 동일한 금액을 달러/원화로) + 연 배당 % · 연 배당금 예상치(야후 파이낸스 최근 12개월
                배당 이력 기반) 요약 카드 */}
            <div
              style={{
                marginTop: 16,
                padding: "20px 16px",
                borderRadius: 24,
                border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={openAssetTrendModal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openAssetTrendModal();
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  자산
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>

                {/* $ / ₩ 표기 통화 슬라이드 토글 - 총 자산, 배당금 표기 둘 다에 적용됨 */}
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    height: 28,
                    padding: 3,
                    borderRadius: 9,
                    background: isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)",
                    border: isLight ? "1px solid rgba(20,22,26,0.1)" : "1px solid rgba(255,255,255,0.1)",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      left: homeCurrencyIndicator.left,
                      width: homeCurrencyIndicator.width,
                      height: "calc(100% - 6px)",
                      borderRadius: 6,
                      background: isLight ? "rgba(20,22,26,0.16)" : "rgba(255,255,255,0.16)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                      transition:
                        "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                  {[
                    { key: "USD", label: "$" },
                    { key: "KRW", label: "₩" },
                  ].map((c, i) => (
                    <button
                      key={c.key}
                      ref={(el) => (homeCurrencyBtnRefs.current[i] = el)}
                      onClick={() => setHomeCurrency(c.key)}
                      onMouseEnter={() => setHomeCurrencyHoverIdx(i)}
                      onMouseLeave={() => setHomeCurrencyHoverIdx(null)}
                      style={{
                        position: "relative",
                        zIndex: 1,
                        width: 22,
                        height: "100%",
                        border: "none",
                        background: "transparent",
                        borderRadius: 6,
                        color:
                          homeCurrency === c.key
                            ? isLight
                              ? "#14161A"
                              : "#FFFFFF"
                            : isLight
                            ? "rgba(20,22,26,0.5)"
                            : "rgba(255,255,255,0.5)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        outline: "none",
                        transition: "color 0.3s ease, transform 0.2s ease",
                        transform: homeCurrencyHoverIdx === i && homeCurrency !== c.key ? "scale(1.12)" : "scale(1)",
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={openAssetTrendModal}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openAssetTrendModal();
                  }
                }}
                style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", cursor: "pointer", outline: "none" }}
              >
                <span style={{ fontSize: 20, fontWeight: 700, color: isLight ? "#14161A" : "#FFFFFF" }}>
                  {formatAmount(homeCurrency === "USD" ? displayTotalUSD : displayTotalKRW, homeCurrency)}
                </span>
                {totalCostBasisUSD > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: totalGainUSD >= 0 ? "#FF5C5C" : "#4D9FFF",
                    }}
                  >
                    {totalGainUSD >= 0 ? "▲ " : "▼ "}
                    {Math.abs(homeCurrency === "USD" ? totalGainUSD : totalGainKRW).toLocaleString(undefined, {
                      maximumFractionDigits: homeCurrency === "USD" ? 2 : 0,
                    })}{" "}
                    ({totalGainPercent >= 0 ? "+" : ""}
                    {totalGainPercent.toFixed(2)}%)
                  </span>
                )}
              </div>

              <div
                style={{
                  height: 1,
                  background: isLight ? "rgba(20,22,26,0.08)" : "rgba(255,255,255,0.08)",
                  margin: "16px 0",
                }}
              />

              <div
                role="button"
                tabIndex={0}
                onClick={openDividendModal}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDividendModal();
                  }
                }}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)",
                    marginBottom: 8,
                  }}
                >
                  배당금
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: isLight ? "#14161A" : "#FFFFFF" }}>
                    {annualDividendYieldPercent.toFixed(2)}%
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
                    }}
                  >
                    {formatAmount(homeCurrency === "USD" ? annualDividendUSD : annualDividendKRW, homeCurrency)}
                  </span>
                </div>
              </div>

              <div
                style={{
                  height: 1,
                  background: isLight ? "rgba(20,22,26,0.08)" : "rgba(255,255,255,0.08)",
                  margin: "16px 0",
                }}
              />

              <div
                role="button"
                tabIndex={0}
                onClick={openGoalModal}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openGoalModal();
                  }
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                style={{ cursor: "pointer", outline: "none", transition: "opacity 0.2s ease" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)",
                    marginBottom: 8,
                  }}
                >
                  목표
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: isLight ? "#14161A" : "#FFFFFF",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {goalTargetUSD > 0 ? `${goalProgressPercent.toFixed(1)}%` : "목표를 설정해보세요"}
                  </span>
                  <div
                    style={{
                      position: "relative",
                      width: "66%",
                      height: 20,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: isLight ? "rgba(20,22,26,0.08)" : "rgba(255,255,255,0.1)",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: "100%",
                        width: `${Math.max(0, Math.min(100, goalProgressPercent))}%`,
                        borderRadius: 10,
                        background: "linear-gradient(90deg, #6C8CFF, #8FA7FF)",
                        transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 벤치마크 카드: 선택한 지수 대비 내 포트폴리오 수익률을 비교하는 벤치마크 모달을 연다 */}
            <div
              style={{
                marginTop: 16,
                padding: "20px 16px",
                borderRadius: 24,
                border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={openBenchmarkModal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openBenchmarkModal();
                    }
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    outline: "none",
                    transition: "opacity 0.2s ease",
                  }}
                >
                  벤치마크
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>

                {/* 벤치마크 리스트형 선택 버튼 - 현재는 S&P500 하나뿐이지만 추후 다른 지수를 추가할 수 있는 구조 */}
                <div ref={benchmarkListRef} style={{ position: "relative" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBenchmarkListOpen((v) => !v);
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
                      background: isLight ? "rgba(20,22,26,0.04)" : "rgba(255,255,255,0.06)",
                      color: isLight ? "#14161A" : "#FFFFFF",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                      transition: "opacity 0.2s ease, background 0.2s ease",
                    }}
                  >
                    {BENCHMARK_OPTIONS.find((b) => b.key === selectedBenchmark)?.label}
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: benchmarkListOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      minWidth: 110,
                      borderRadius: 12,
                      background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
                      backdropFilter: "blur(20px) saturate(180%)",
                      WebkitBackdropFilter: "blur(20px) saturate(180%)",
                      border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                      boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
                      overflow: "hidden",
                      zIndex: 5,
                      opacity: benchmarkListOpen ? 1 : 0,
                      transform: benchmarkListOpen ? "scale(1) translateY(0)" : "scale(0.92) translateY(-6px)",
                      pointerEvents: benchmarkListOpen ? "auto" : "none",
                      transformOrigin: "top right",
                      transition:
                        "opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
                    {BENCHMARK_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setSelectedBenchmark(opt.key);
                          setBenchmarkListOpen(false);
                        }}
                        onMouseEnter={(e) => {
                          if (opt.key !== selectedBenchmark)
                            e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          if (opt.key !== selectedBenchmark) e.currentTarget.style.background = "transparent";
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 12px",
                          border: "none",
                          background:
                            opt.key === selectedBenchmark
                              ? isLight
                                ? "rgba(20,22,26,0.08)"
                                : "rgba(255,255,255,0.1)"
                              : "transparent",
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontSize: 12,
                          fontWeight: opt.key === selectedBenchmark ? 700 : 500,
                          cursor: "pointer",
                          outline: "none",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {active === 1 && (
          <>
            {/* 상단 헤더: 제목 + 테마 토글 (스크롤해도 화면 상단에 고정) */}
            <div style={stickyHeaderStyle}>
              <div>
                <h1
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: 22,
                    fontWeight: 700,
                    color: (isLight ? "#14161A" : "#FFFFFF"),
                    letterSpacing: 0.2,
                  }}
                >
                  αlloy
                </h1>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 700,
                    color: (isLight ? "#14161A" : "#FFFFFF"),
                    letterSpacing: 0.2,
                  }}
                >
                  포트폴리오
                </h1>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* 라이트/다크 모드 토글 (리퀴드 글래스 원형 버튼) */}
                <button
                  onClick={() => {
                    toggleTheme();
                    setThemeHovered(false);
                  }}
                  onMouseEnter={() => setThemeHovered(true)}
                  onMouseLeave={() => setThemeHovered(false)}
                  aria-label="테마 전환"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: isLight
                      ? "1px solid rgba(20,22,26,0.12)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: themeHovered
                      ? isLight
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.14)"
                      : isLight
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: themeHovered
                      ? isLight
                        ? "0 6px 20px rgba(20,22,26,0.14), inset 0 1px 0 rgba(255,255,255,0.6)"
                        : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : isLight
                      ? "0 4px 14px rgba(20,22,26,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    transition:
                      "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: themeHovered ? "scale(1.08)" : "scale(1)",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={isLight ? "#14161A" : "#FFFFFF"}
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 원그래프 */}
            <div
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "center",
                marginBottom: 36,
              }}
            >
              <PieChart width={230} height={230}>
                <Tooltip content={<PieTooltip />} />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={72}
                  outerRadius={106}
                  paddingAngle={chartData.length > 1 ? 3 : 0}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>

              {/* 원그래프 중앙 자산 총액 (통화별 각각 환산하여 표기) */}
              {!isEmpty && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: (isLight ? "#14161A" : "#FFFFFF"),
                    }}
                  >
                    ${Math.round(displayTotalUSD).toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: (isLight ? "#14161A" : "#FFFFFF"),
                    }}
                  >
                    ₩{Math.round(displayTotalKRW).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* 카테고리별 종목 - 모든 카테고리는 보유 종목이 없어도 항상 표시(+ 버튼으로 언제든 추가 가능) */}
            {Object.entries(portfolio).map(([key, category]) => (
                  <div
                    key={key}
                    style={{
                      padding: draggedInfo && draggedInfo.key === key ? "12px" : "20px 16px",
                      margin:
                        draggedInfo && draggedInfo.key === key
                          ? "0 -4px 16px -4px"
                          : "0 0 16px 0",
                      borderRadius: 24,
                      border:
                        draggedInfo && draggedInfo.key === key
                          ? "1.5px dashed rgba(143,167,255,0.55)"
                          : `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
                      transition: "border 0.2s ease, padding 0.2s ease, margin 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 18,
                          fontWeight: 700,
                          color: (isLight ? "#14161A" : "#FFFFFF"),
                        }}
                      >
                        {category.label}
                      </h2>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal(key === "stocks" ? "stock" : "cash");
                        }}
                        aria-label={`${category.label} 추가하기`}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          fontSize: 16,
                          fontWeight: 700,
                          lineHeight: 1,
                          cursor: "pointer",
                          outline: "none",
                          color: (isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)"),
                        }}
                      >
                        +
                      </button>
                    </div>

                    {key === "stocks"
                      ? category.holdings.map((h, i) => (
                          <div
                            key={i}
                            onClick={() => openInfoModal(h.originalIndex)}
                            onDragOver={handleDragOver("stocks", h.originalIndex)}
                            onDrop={handleDrop("stocks", h.originalIndex)}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              padding: "12px 8px",
                              margin: "0 -8px",
                              borderRadius: 10,
                              cursor: "pointer",
                              transition: "background 0.2s ease, opacity 0.2s ease",
                              opacity:
                                draggedInfo &&
                                draggedInfo.key === "stocks" &&
                                draggedInfo.index === h.originalIndex
                                  ? 0.4
                                  : 1,
                              borderTop:
                                dragOverIndex === h.originalIndex &&
                                draggedInfo &&
                                draggedInfo.key === "stocks" &&
                                draggedInfo.index !== h.originalIndex
                                  ? "2px solid #8FA7FF"
                                  : "2px solid transparent",
                              borderBottom: "none",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = (isLight ? "rgba(20,22,26,0.04)" : "rgba(255,255,255,0.04)"))
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 6,
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: h.color,
                                    flexShrink: 0,
                                    marginTop: 6,
                                  }}
                                />
                                <span style={{ minWidth: 0, wordBreak: "break-word" }}>
                                  <span
                                    style={{
                                      fontSize: 16,
                                      fontWeight: 700,
                                      color: (isLight ? "#14161A" : "#FFFFFF"),
                                    }}
                                  >
                                    {h.name || h.ticker}
                                  </span>
                                  {h.name && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: (isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)"),
                                        marginLeft: 4,
                                      }}
                                    >
                                      {h.ticker}
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditModal("stock", h.originalIndex);
                                    }}
                                    aria-label="종목 수정"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: 20,
                                      height: 20,
                                      marginLeft: 4,
                                      padding: 0,
                                      border: "none",
                                      background: "transparent",
                                      color: (isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)"),
                                      cursor: "pointer",
                                      outline: "none",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                  </button>
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: (isLight ? "#14161A" : "#FFFFFF"),
                                  flexShrink: 0,
                                }}
                              >
                                {h.value}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span
                                  draggable
                                  onDragStart={handleDragStart("stocks", h.originalIndex)}
                                  onDragEnd={handleDragEnd}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 2,
                                    cursor: "grab",
                                    padding: "4px 2px",
                                    marginRight: 2,
                                  }}
                                >
                                  <span style={{ display: "flex", gap: 2 }}>
                                    <i style={dotStyle} />
                                    <i style={dotStyle} />
                                  </span>
                                  <span style={{ display: "flex", gap: 2 }}>
                                    <i style={dotStyle} />
                                    <i style={dotStyle} />
                                  </span>
                                </span>
                                <span
                                  style={{
                                    fontSize: 16,
                                    color: (isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)"),
                                  }}
                                >
                                  {h.shares}
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: (isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)"),
                                  }}
                                >
                                  ({h.percent}%)
                                </span>
                              </span>
                              {h.gainAmount !== null && (
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: h.gainAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                                    flexShrink: 0,
                                  }}
                                >
                                  {h.gainAmount >= 0 ? "▲ " : "▼ "}
                                  {formatGainAmount(h.gainAmount, h.ticker)} (
                                  {h.returnPercent >= 0 ? "+" : ""}
                                  {h.returnPercent.toFixed(2)}%)
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      : category.holdings.map((c, i) => (
                          <div
                            key={i}
                            onClick={() => openEditModal("cash", c.originalIndex)}
                            onDragOver={handleDragOver("cash", c.originalIndex)}
                            onDrop={handleDrop("cash", c.originalIndex)}
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              padding: "12px 8px",
                              margin: "0 -8px",
                              borderRadius: 10,
                              cursor: "pointer",
                              transition: "background 0.2s ease, opacity 0.2s ease",
                              opacity:
                                draggedInfo &&
                                draggedInfo.key === "cash" &&
                                draggedInfo.index === c.originalIndex
                                  ? 0.4
                                  : 1,
                              borderTop:
                                dragOverIndex === c.originalIndex &&
                                draggedInfo &&
                                draggedInfo.key === "cash" &&
                                draggedInfo.index !== c.originalIndex
                                  ? "2px solid #8FA7FF"
                                  : "2px solid transparent",
                              borderBottom: "none",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = (isLight ? "rgba(20,22,26,0.04)" : "rgba(255,255,255,0.04)"))
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                draggable
                                onDragStart={handleDragStart("cash", c.originalIndex)}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  cursor: "grab",
                                  padding: "4px 2px",
                                  marginRight: 2,
                                }}
                              >
                                <span style={{ display: "flex", gap: 2 }}>
                                  <i style={dotStyle} />
                                  <i style={dotStyle} />
                                </span>
                                <span style={{ display: "flex", gap: 2 }}>
                                  <i style={dotStyle} />
                                  <i style={dotStyle} />
                                </span>
                              </span>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: c.color,
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: (isLight ? "#14161A" : "#FFFFFF"),
                                }}
                              >
                                {c.currency}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: (isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)"),
                                }}
                              >
                                ({c.percent}%)
                              </span>
                            </span>
                            <span
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: (isLight ? "#14161A" : "#FFFFFF"),
                              }}
                            >
                              {c.amount}
                            </span>
                          </div>
                        ))}
                  </div>
                )
              )}

            {/* 빈 포트폴리오 안내 */}
            {isEmpty && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "32vh",
                  textAlign: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 600, color: (isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)") }}>
                  아직 등록된 자산이 없어요
                </div>
              </div>
            )}
          </>
        )}

        {active === 2 && (
          <>
            {/* 상단 헤더: 제목 + 테마 토글 (스크롤해도 화면 상단에 고정) */}
            <div style={stickyHeaderStyle}>
              <div>
                <h1
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: 22,
                    fontWeight: 700,
                    color: (isLight ? "#14161A" : "#FFFFFF"),
                    letterSpacing: 0.2,
                  }}
                >
                  αlloy
                </h1>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 700,
                    color: (isLight ? "#14161A" : "#FFFFFF"),
                    letterSpacing: 0.2,
                  }}
                >
                  설정
                </h1>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* 라이트/다크 모드 토글 (리퀴드 글래스 원형 버튼) */}
                <button
                  onClick={() => {
                    toggleTheme();
                    setThemeHovered(false);
                  }}
                  onMouseEnter={() => setThemeHovered(true)}
                  onMouseLeave={() => setThemeHovered(false)}
                  aria-label="테마 전환"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: isLight
                      ? "1px solid rgba(20,22,26,0.12)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: themeHovered
                      ? isLight
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.14)"
                      : isLight
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: themeHovered
                      ? isLight
                        ? "0 6px 20px rgba(20,22,26,0.14), inset 0 1px 0 rgba(255,255,255,0.6)"
                        : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : isLight
                      ? "0 4px 14px rgba(20,22,26,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    transition:
                      "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: themeHovered ? "scale(1.08)" : "scale(1)",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={isLight ? "#14161A" : "#FFFFFF"}
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 프로필: 기본 원형 이미지 + 닉네임 + 수정 버튼 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isLight ? "rgba(20,22,26,0.08)" : "rgba(255,255,255,0.1)",
                  border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.14)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill={isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.4)"}
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                </svg>
              </div>

              {nicknameEditing ? (
                <input
                  ref={nicknameInputRef}
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  onBlur={(e) => saveNickname(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setNicknameEditing(false);
                  }}
                  maxLength={20}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    textAlign: "center",
                    color: isLight ? "#14161A" : "#FFFFFF",
                    background: "transparent",
                    border: "none",
                    borderBottom: `1px solid ${isLight ? "rgba(20,22,26,0.3)" : "rgba(255,255,255,0.3)"}`,
                    outline: "none",
                    width: 160,
                    padding: "2px 0",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px auto 22px",
                    alignItems: "center",
                    columnGap: 6,
                  }}
                >
                  <span aria-hidden="true" />
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      textAlign: "center",
                      color: isLight ? "#14161A" : "#FFFFFF",
                    }}
                  >
                    {nickname || "사용자"}
                  </span>
                  <button
                    onClick={startEditingNickname}
                    aria-label="닉네임 수정"
                    style={{
                      width: 22,
                      height: 22,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      outline: "none",
                      color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* 계정 카테고리 (버전 빌드 포함, 테두리 레이아웃으로 묶음) */}
            <div
              style={{
                padding: "20px 16px",
                borderRadius: 24,
                border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
              }}
            >
              <h2
                style={{
                  margin: "0 0 14px 0",
                  fontSize: 18,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                계정
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: isLight ? "rgba(20,22,26,0.65)" : "rgba(255,255,255,0.65)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginRight: 12,
                  }}
                >
                  {session.user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  style={{
                    flexShrink: 0,
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 10,
                    border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                    background: "transparent",
                    color: isLight ? "rgba(20,22,26,0.7)" : "rgba(255,255,255,0.7)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  로그아웃
                </button>
              </div>

              {/* 앱 버전 표기 (PR 업데이트마다 최신 PR 번호로 갱신) */}
              <div style={{ marginTop: 16 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  alloy v{APP_VERSION}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 하단 컨트롤 영역 */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* 리퀴드 글래스 탭바 */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: BAR_HEIGHT,
            padding: "0 8px",
            borderRadius: 999,
            background: isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* 이동하는 선택 인디케이터 */}
          <div
            style={{
              position: "absolute",
              top: 8,
              left: indicator.left,
              width: indicator.width,
              height: BAR_HEIGHT - 16,
              borderRadius: 999,
              background: (isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"),
              boxShadow:
                "0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
              transition: "left 0.45s cubic-bezier(0.22, 1, 0.36, 1), width 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />

          {tabs.map((tab, i) => {
            const isActive = active === i;
            const isHovered = hovered === i;
            return (
              <button
                key={tab}
                ref={(el) => (btnRefs.current[i] = el)}
                onClick={() => setActive(i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: "relative",
                  zIndex: 1,
                  minWidth: 76,
                  height: BAR_HEIGHT - 16,
                  padding: "0 28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  background: isHovered && !isActive
                    ? (isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.06)")
                    : "transparent",
                  borderRadius: 999,
                  color: isActive
                    ? (isLight ? "#14161A" : "#FFFFFF")
                    : isHovered
                    ? (isLight ? "rgba(20,22,26,0.85)" : "rgba(255,255,255,0.85)")
                    : (isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)"),
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: 0.2,
                  cursor: "pointer",
                  transition:
                    "color 0.3s ease, background 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                  transform: isHovered && !isActive ? "translateY(-1px)" : "translateY(0)",
                  outline: "none",
                }}
              >
                {i === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3.2 3 10.5V20a1 1 0 0 0 1 1h5.5v-6.5h5V21H19a1 1 0 0 0 1-1v-9.5L12 3.2z" />
                  </svg>
                ) : i === 2 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="8" r="3.6" />
                    <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="13" width="4" height="7" rx="1" />
                    <rect x="10" y="8" width="4" height="12" rx="1" />
                    <rect x="16" y="3" width="4" height="17" rx="1" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* 명령어 입력창 버튼 (리퀴드 글래스, 탭바와 동일한 높이의 원형) */}
        <button
          onClick={toggleChat}
          onMouseEnter={() => setChatHovered(true)}
          onMouseLeave={() => setChatHovered(false)}
          aria-label="명령어 입력창 열기"
          style={{
            width: BAR_HEIGHT,
            height: BAR_HEIGHT,
            flexShrink: 0,
            borderRadius: "50%",
            border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
            background: chatHovered
              ? (isLight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.14)")
              : (isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.06)"),
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            boxShadow: chatHovered
              ? "0 10px 36px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)"
              : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
            color: isLight ? "#14161A" : "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            outline: "none",
            transition:
              "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
            transform: chatHovered ? "scale(1.08)" : "scale(1)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
            <path d="M8 10h.01M12 10h.01M16 10h.01" />
          </svg>
        </button>
      </div>

      {/* 서브 액션바 알림 (리퀴드 글래스, 탭바 바로 위) */}
      {subActionNotice && (
        <div
          style={{
            position: "fixed",
            bottom: 24 + BAR_HEIGHT + 14,
            left: "50%",
            zIndex: 11,
            opacity: subActionVisible ? 1 : 0,
            transform: subActionVisible ? "translate(-50%, 0)" : "translate(-50%, 8px)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.1)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow: "0 8px 28px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              fontSize: 12,
              fontWeight: 600,
              color: subActionIsError ? "rgba(255,138,138,0.9)" : isLight ? "#14161A" : "#FFFFFF",
              whiteSpace: "nowrap",
            }}
          >
            {subActionText}
          </div>
        </div>
      )}

      {/* 명령어 입력창 패널 (리퀴드 글래스, 탭바 위에 슬라이드로 등장) */}
      {chatOpen && (
        <>
          <div onClick={toggleChat} style={{ position: "fixed", inset: 0, zIndex: 9 }} />
          <div
            style={{
              position: "fixed",
              bottom: keyboardOffset > 0 ? keyboardOffset + 14 : 24 + BAR_HEIGHT + 14,
              left: "50%",
              zIndex: 10,
              width: "min(360px, 88vw)",
              opacity: chatVisible ? 1 : 0,
              transform: chatVisible
                ? "translate(-50%, 0)"
                : "translate(-50%, 16px)",
              transition:
                "opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), bottom 0.25s ease",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 12,
                borderRadius: 26,
                background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
                backdropFilter: "blur(28px) saturate(180%)",
                WebkitBackdropFilter: "blur(28px) saturate(180%)",
                border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                boxShadow:
                  "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 4px",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                    flexShrink: 0,
                  }}
                >
                  터미널
                </span>
              </div>
              {!chatSortMode &&
                !pendingCommand &&
                !chatDoneNotice &&
                chatMessage.startsWith("/") &&
                (() => {
                  const query = chatMessage.slice(1).toLowerCase();
                  // /target 은 인자를 입력하는 중에도 전송 전까지 설명란을 계속 표기
                  const isTargetActive = query.startsWith("target");
                  const targetCmd = COMMANDS.find((c) => c.name === "target");
                  const matches = isTargetActive
                    ? targetCmd
                      ? [targetCmd]
                      : []
                    : COMMANDS.filter((c) => c.name.startsWith(query)).sort((a, b) =>
                        a.name.localeCompare(b.name)
                      );
                  if (matches.length === 0) return null;
                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        padding: "0 4px",
                      }}
                    >
                      {matches.map((cmd, i) => (
                        <div
                          key={cmd.name}
                          onClick={() => {
                            if (cmd.name === "sort") {
                              setChatSortMode(true);
                              setChatMessage("");
                            } else if (cmd.name === "target" && !chatMessage.includes(" ")) {
                              setChatMessage("/target ");
                            }
                          }}
                          onMouseEnter={() => setCmdHoverIdx(i)}
                          onMouseLeave={() =>
                            setCmdHoverIdx((prev) => (prev === i ? null : prev))
                          }
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 10,
                            cursor: "pointer",
                            background:
                              cmdHoverIdx === i
                                ? isLight
                                  ? "rgba(20,22,26,0.10)"
                                  : "rgba(255,255,255,0.12)"
                                : "transparent",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: isLight ? "#14161A" : "#FFFFFF",
                            }}
                          >
                            /{cmd.name}
                          </span>
                          {(() => {
                            const descText =
                              cmd.name === "target" && isTargetActive && cmd.usage
                                ? cmd.usage
                                : cmd.desc;
                            return (
                              descText && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: isLight
                                      ? "rgba(20,22,26,0.45)"
                                      : "rgba(255,255,255,0.45)",
                                  }}
                                >
                                  {descText}
                                </span>
                              )
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              {isTargetTickerSelect &&
                !pendingCommand &&
                !chatDoneNotice &&
                stockHoldings.length > 0 && (
                  <div
                    style={{
                      maxHeight: 80,
                      overflowY: "auto",
                      padding: "0 4px",
                    }}
                  >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    {stockHoldings.map((h, i) => (
                      <button
                        key={h.ticker}
                        onClick={() => setChatMessage(`/target ${h.ticker} `)}
                        onMouseEnter={() => setTargetGridHoverIdx(i)}
                        onMouseLeave={() =>
                          setTargetGridHoverIdx((prev) => (prev === i ? null : prev))
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          height: 34,
                          padding: "0 10px",
                          borderRadius: 10,
                          border: "none",
                          background:
                            targetGridHoverIdx === i
                              ? isLight
                                ? "rgba(20,22,26,0.10)"
                                : "rgba(255,255,255,0.12)"
                              : isLight
                              ? "rgba(20,22,26,0.05)"
                              : "rgba(255,255,255,0.06)",
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          outline: "none",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: h.color,
                            flexShrink: 0,
                          }}
                        />
                        {h.ticker}
                      </button>
                    ))}
                  </div>
                  </div>
                )}
              {targetNoticeText && (
                <div
                  style={{
                    padding: "4px 14px",
                    fontSize: 14,
                    lineHeight: 1.4,
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    color: isLight ? "#14161A" : "#FFFFFF",
                  }}
                >
                  {typedTargetNotice}
                </div>
              )}
              {chatSortMode && !pendingCommand && !chatDoneNotice && (
                <div
                  style={{
                    padding: "0 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#FFFFFF",
                  }}
                >
                  {typedSortPrompt}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
              {pendingCommand ? (
                <div
                  style={{
                    flex: 1,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 14px",
                    fontSize: 14,
                    color: isLight ? "#14161A" : "#FFFFFF",
                  }}
                >
                  {COMMAND_RUNNING_TEXT.slice(0, runningTypedCount)}
                </div>
              ) : chatDoneNotice ? (
                <div
                  style={{
                    flex: 1,
                    minHeight: 40,
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 14px",
                    fontSize: 14,
                    lineHeight: 1.4,
                    color: isLight ? "#14161A" : "#FFFFFF",
                  }}
                >
                  {chatDoneText.slice(0, doneTypedCount)}
                </div>
              ) : chatSortMode ? (
                [
                  { key: "name", label: "이름" },
                  { key: "percent", label: "비중" },
                  { key: "quantity", label: "수량" },
                ].map((opt, i) => (
                  <button
                    key={opt.key}
                    onClick={() => setPendingCommand({ kind: "sort", criteria: opt.key })}
                    onMouseEnter={() => setSortHoverIdx(i)}
                    onMouseLeave={() =>
                      setSortHoverIdx((prev) => (prev === i ? null : prev))
                    }
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 999,
                      border: "none",
                      background:
                        sortHoverIdx === i
                          ? isLight
                            ? "rgba(20,22,26,0.18)"
                            : "rgba(255,255,255,0.22)"
                          : isLight
                          ? "rgba(20,22,26,0.10)"
                          : "rgba(255,255,255,0.12)",
                      color: isLight ? "#14161A" : "#FFFFFF",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                      transform: sortHoverIdx === i ? "scale(1.04)" : "scale(1)",
                      transition: "transform 0.2s ease, background 0.2s ease",
                    }}
                  >
                    {opt.label}
                  </button>
                ))
              ) : (
                <>
                  <input
                    type="text"
                    autoFocus
                    value={chatMessage}
                    onChange={(e) => {
                      setChatMessage(e.target.value);
                      if (targetNoticeText) setTargetNoticeText(null);
                    }}
                    placeholder="명령어를 입력하세요"
                    style={{
                      flex: 1,
                      height: 40,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: "none",
                      background: "transparent",
                      color: isLight ? "#14161A" : "#FFFFFF",
                      fontSize: 16,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleChatSend}
                    aria-label="전송"
                    style={{
                      width: 40,
                      height: 40,
                      flexShrink: 0,
                      borderRadius: "50%",
                      border: "none",
                      background: isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.14)",
                      color: isLight ? "#14161A" : "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 11l18-8-8 18-2-8-8-2z" />
                    </svg>
                  </button>
                </>
              )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* S&P500 지수 캔들차트 모달 */}
      {snp500IndexModalOpen && snp500Index && (
        <div
          onClick={closeSnp500IndexModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: snp500IndexModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: snp500IndexModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: snp500IndexModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: snp500IndexModalVisible ? 1 : 0,
              transform: snp500IndexModalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              {snp500Index.name}
            </h2>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                {snp500Index.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {snp500Index.changeAmount != null && snp500Index.changePercent != null && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: snp500Index.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                  }}
                >
                  {snp500Index.changeAmount >= 0 ? "▲ " : "▼ "}
                  {Math.abs(snp500Index.changeAmount).toFixed(2)} (
                  {snp500Index.changePercent >= 0 ? "+" : ""}
                  {snp500Index.changePercent.toFixed(2)}%)
                </span>
              )}
            </div>

            <IndexCandleChart
              isLight={isLight}
              period={snp500Period}
              onPeriodChange={setSnp500Period}
              candles={snp500Candles}
              candlesLoading={snp500CandlesLoading}
            />
          </div>
        </div>
      )}

      {/* 나스닥 지수 캔들차트 모달 (S&P500 지수 모달과 동일한 크기/스타일) */}
      {nasdaqIndexModalOpen && nasdaqIndex && (
        <div
          onClick={closeNasdaqIndexModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: nasdaqIndexModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: nasdaqIndexModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: nasdaqIndexModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: nasdaqIndexModalVisible ? 1 : 0,
              transform: nasdaqIndexModalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              {nasdaqIndex.name}
            </h2>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                {nasdaqIndex.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {nasdaqIndex.changeAmount != null && nasdaqIndex.changePercent != null && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: nasdaqIndex.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                  }}
                >
                  {nasdaqIndex.changeAmount >= 0 ? "▲ " : "▼ "}
                  {Math.abs(nasdaqIndex.changeAmount).toFixed(2)} (
                  {nasdaqIndex.changePercent >= 0 ? "+" : ""}
                  {nasdaqIndex.changePercent.toFixed(2)}%)
                </span>
              )}
            </div>

            <IndexCandleChart
              isLight={isLight}
              period={nasdaqPeriod}
              onPeriodChange={setNasdaqPeriod}
              candles={nasdaqCandles}
              candlesLoading={nasdaqCandlesLoading}
            />
          </div>
        </div>
      )}

      {/* 코스피 지수 캔들차트 모달 (S&P500 지수 모달과 동일한 크기/스타일) */}
      {kospiIndexModalOpen && kospiIndex && (
        <div
          onClick={closeKospiIndexModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: kospiIndexModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: kospiIndexModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: kospiIndexModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: kospiIndexModalVisible ? 1 : 0,
              transform: kospiIndexModalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              {kospiIndex.name}
            </h2>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                {kospiIndex.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {kospiIndex.changeAmount != null && kospiIndex.changePercent != null && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: kospiIndex.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                  }}
                >
                  {kospiIndex.changeAmount >= 0 ? "▲ " : "▼ "}
                  {Math.abs(kospiIndex.changeAmount).toFixed(2)} (
                  {kospiIndex.changePercent >= 0 ? "+" : ""}
                  {kospiIndex.changePercent.toFixed(2)}%)
                </span>
              )}
            </div>

            <IndexCandleChart
              isLight={isLight}
              period={kospiPeriod}
              onPeriodChange={setKospiPeriod}
              candles={kospiCandles}
              candlesLoading={kospiCandlesLoading}
            />
          </div>
        </div>
      )}

      {/* 코스닥 지수 캔들차트 모달 (S&P500 지수 모달과 동일한 크기/스타일) */}
      {kosdaqIndexModalOpen && kosdaqIndex && (
        <div
          onClick={closeKosdaqIndexModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: kosdaqIndexModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: kosdaqIndexModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: kosdaqIndexModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: kosdaqIndexModalVisible ? 1 : 0,
              transform: kosdaqIndexModalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              {kosdaqIndex.name}
            </h2>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                {kosdaqIndex.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {kosdaqIndex.changeAmount != null && kosdaqIndex.changePercent != null && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: kosdaqIndex.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                  }}
                >
                  {kosdaqIndex.changeAmount >= 0 ? "▲ " : "▼ "}
                  {Math.abs(kosdaqIndex.changeAmount).toFixed(2)} (
                  {kosdaqIndex.changePercent >= 0 ? "+" : ""}
                  {kosdaqIndex.changePercent.toFixed(2)}%)
                </span>
              )}
            </div>

            <IndexCandleChart
              isLight={isLight}
              period={kosdaqPeriod}
              onPeriodChange={setKosdaqPeriod}
              candles={kosdaqCandles}
              candlesLoading={kosdaqCandlesLoading}
            />
          </div>
        </div>
      )}

      {/* 환율(원/달러, 원/엔) + S&P500 선물/나스닥100 선물 + 미국채(3개월/5/10/30년) 캔들차트 모달 - 지수 모달과 동일한 공용 컴포넌트 사용 */}
      <IndexModal isLight={isLight} state={fxKrwUsd} />
      <IndexModal isLight={isLight} state={fxKrwJpy} />
      <IndexModal isLight={isLight} state={snp500Futures} />
      <IndexModal isLight={isLight} state={nasdaq100Futures} />
      <IndexModal isLight={isLight} state={ust1y} />
      <IndexModal isLight={isLight} state={ust5y} />
      <IndexModal isLight={isLight} state={ust10y} />
      <IndexModal isLight={isLight} state={ust30y} />

      {/* 종목 정보 모달 (종목 클릭 시 표시, 가격 차트) */}
      {infoModalOpen && infoHolding && (
        <div
          onClick={closeInfoModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: infoModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: infoModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: infoModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(320px, 84vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: infoModalVisible ? 1 : 0,
              transform: infoModalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: infoHolding.color,
                  flexShrink: 0,
                }}
              />
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 600,
                  color: isLight ? "#14161A" : "#FFFFFF",
                  letterSpacing: 0.2,
                }}
              >
                {infoHolding.name || infoHolding.ticker}
              </h2>
              {infoHolding.name && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  {infoHolding.ticker}
                </span>
              )}
            </div>

            {infoCurrentLoading ? (
              <div style={{ margin: "10px 0 6px 0" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                  }}
                >
                  불러오는 중...
                </span>
              </div>
            ) : infoCurrent && infoCurrent.price != null ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "10px 0 6px 0" }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: isLight ? "#14161A" : "#FFFFFF",
                  }}
                >
                  {formatStockPrice(infoCurrent.price, infoHolding.ticker, infoHolding.currency)}
                </span>
                {infoCurrent.changeAmount != null && infoCurrent.changePercent != null && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: infoCurrent.changeAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                    }}
                  >
                    {infoCurrent.changeAmount >= 0 ? "▲ " : "▼ "}
                    {Math.abs(infoCurrent.changeAmount).toFixed(2)} (
                    {infoCurrent.changePercent >= 0 ? "+" : ""}
                    {infoCurrent.changePercent.toFixed(2)}%)
                  </span>
                )}
              </div>
            ) : (
              <div style={{ margin: "10px 0 6px 0" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                  }}
                >
                  현재가 정보를 불러올 수 없어요
                </span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
                }}
              >
                {formatStockPrice(infoHolding.avgPrice, infoHolding.ticker, infoHolding.currency)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                }}
              >
                평균단가
              </span>
            </div>

            <IndexCandleChart
              isLight={isLight}
              period={infoPeriod}
              onPeriodChange={setInfoPeriod}
              candles={infoCandles}
              candlesLoading={infoCandlesLoading}
            />
          </div>
        </div>
      )}

      {/* 배당 캘린더 모달 (홈 탭 "연 배당" 클릭 시 표시): 최근 12개월치 배당 이력을 지급된 달(1~12월)별로
          쌓은 막대그래프. 각 종목 막대 색상은 투자 탭 원그래프와 동일한 stockColorByTicker를 그대로 사용한다. */}
      {dividendModalOpen && (
        <div
          onClick={closeDividendModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: dividendModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: dividendModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: dividendModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: dividendModalVisible ? 1 : 0,
              transform: dividendModalVisible ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 2px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              배당 캘린더
            </h2>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
              }}
            >
              세금 15%
            </span>

            {dividendActiveTickers.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 150,
                  fontSize: 12,
                  color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                }}
              >
                아직 등록된 자산이 없어요
              </div>
            ) : (
              <>
                <div style={{ width: "100%", height: 190, marginTop: 14 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dividendMonthlyData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                      <XAxis
                        dataKey="month"
                        tick={{
                          fontSize: 9,
                          fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                        }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis hide domain={[0, "dataMax"]} />
                      <Tooltip cursor={{ fill: isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.08)" }} content={<DividendMonthTooltip />} />
                      {dividendActiveTickers.map((ticker) => (
                        <Bar
                          key={ticker}
                          dataKey={ticker}
                          stackId="dividend"
                          fill={stockColorByTicker[ticker]}
                          isAnimationActive={false}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 14 }}>
                  {dividendActiveTickers.map((ticker) => (
                    <div key={ticker} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: stockColorByTicker[ticker],
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: isLight ? "rgba(20,22,26,0.65)" : "rgba(255,255,255,0.65)",
                        }}
                      >
                        {dividendTickerNames[ticker] || ticker}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 자산 추이 모달 (홈 탭 "자산" 클릭 시 표시): 1일/1주/3달/1년 기간별 자산 평가금액 꺾은선 그래프.
          표기 통화는 홈 카드의 $/₩ 스위치(homeCurrency)를 그대로 따른다. */}
      {assetTrendModalOpen && (
        <div
          onClick={closeAssetTrendModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: assetTrendModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: assetTrendModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: assetTrendModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: assetTrendModalVisible ? 1 : 0,
              transform: assetTrendModalVisible ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              자산 추이
            </h2>

            <div style={{ marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                {formatAmount(homeCurrency === "USD" ? displayTotalUSD : displayTotalKRW, homeCurrency)}
              </span>
            </div>

            {/* 1일/1주/3달/1년 기간 탭 - 지수 모달(IndexCandleChart)과 동일한 크기/레이아웃/위치 */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
              {INDEX_CANDLE_PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setAssetTrendPeriod(p.key)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 8,
                    border: "none",
                    background:
                      assetTrendPeriod === p.key
                        ? isLight
                          ? "rgba(20,22,26,0.14)"
                          : "rgba(255,255,255,0.14)"
                        : "transparent",
                    color:
                      assetTrendPeriod === p.key
                        ? isLight
                          ? "#14161A"
                          : "#FFFFFF"
                        : isLight
                        ? "rgba(20,22,26,0.4)"
                        : "rgba(255,255,255,0.4)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    transition: "background 0.2s ease, color 0.2s ease",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 190 }}>
              {assetTrendLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  불러오는 중...
                </div>
              ) : assetTrendSeries.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  아직 등록된 자산이 없어요
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={assetTrendSeries} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="assetTrendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={assetTrendColor} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={assetTrendColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="ts"
                      tickFormatter={(ts) => formatKstAxisLabel(ts, assetTrendPeriod)}
                      tick={{
                        fontSize: 9,
                        fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                      }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis hide domain={["dataMin", "dataMax"]} />
                    <Tooltip
                      content={<AssetTrendTooltip />}
                      cursor={{ stroke: isLight ? "rgba(20,22,26,0.2)" : "rgba(255,255,255,0.2)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="valueUSD"
                      stroke={assetTrendColor}
                      strokeWidth={2}
                      fill="url(#assetTrendGradient)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 목표 모달 (홈 탭 "목표" 클릭 시 표시): 목표를 설정한 날짜부터 지금까지의 달성률(%) 추이 그래프.
          목표 금액은 확인 버튼 없이 입력을 완료(포커스 아웃/Enter)하면 즉시 저장되고 서브 액션바로 안내된다.
          표기 통화는 홈 카드의 $/₩ 스위치(homeCurrency)를 그대로 따른다. */}
      {goalModalOpen && (
        <div
          onClick={closeGoalModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: goalModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: goalModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: goalModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: goalModalVisible ? 1 : 0,
              transform: goalModalVisible ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              목표
            </h2>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 4,
                flexWrap: "wrap",
                marginBottom: 14,
                fontSize: 15,
                fontWeight: 700,
                color: isLight ? "#14161A" : "#FFFFFF",
              }}
            >
              <span>{formatAmount(homeCurrency === "USD" ? grandTotalUSD : grandTotalUSD * todayRate, homeCurrency)}</span>
              <span style={{ opacity: 0.4, fontWeight: 500 }}>/</span>
              {goalEditing ? (
                <span style={{ display: "inline-flex", alignItems: "baseline" }}>
                  <span>{homeCurrency === "USD" ? "$" : "₩"}</span>
                  <input
                    ref={goalInputRef}
                    type="text"
                    inputMode="decimal"
                    value={formatWithCommas(goalDraft)}
                    onChange={handleNumericChange(setGoalDraft)}
                    onBlur={(e) => saveGoal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.target.blur();
                      }
                    }}
                    style={{
                      width: 100,
                      border: "none",
                      borderBottom: `1.5px solid ${isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)"}`,
                      background: "transparent",
                      color: isLight ? "#14161A" : "#FFFFFF",
                      fontSize: 15,
                      fontWeight: 700,
                      outline: "none",
                      padding: "0 2px",
                      transition: "border-color 0.2s ease",
                    }}
                  />
                </span>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={startEditingGoal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startEditingGoal();
                    }
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{
                    cursor: "pointer",
                    outline: "none",
                    textDecoration: "underline",
                    textDecorationStyle: "solid",
                    textUnderlineOffset: 3,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  {goalTargetUSD > 0
                    ? formatAmount(homeCurrency === "USD" ? goalTargetUSD : goalTargetUSD * todayRate, homeCurrency)
                    : "설정하기"}
                </span>
              )}
              {goalTargetUSD > 0 && (
                <span style={{ opacity: 0.5, fontSize: 13, fontWeight: 600 }}>({goalProgressPercent.toFixed(1)}%)</span>
              )}
            </div>

            {/* 1일/1주/3달/1년 기간 탭 - 지수 모달(IndexCandleChart)/자산 추이 모달과 동일한 크기/레이아웃/위치 */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
              {INDEX_CANDLE_PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setGoalPeriod(p.key)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 8,
                    border: "none",
                    background:
                      goalPeriod === p.key
                        ? isLight
                          ? "rgba(20,22,26,0.14)"
                          : "rgba(255,255,255,0.14)"
                        : "transparent",
                    color:
                      goalPeriod === p.key
                        ? isLight
                          ? "#14161A"
                          : "#FFFFFF"
                        : isLight
                        ? "rgba(20,22,26,0.4)"
                        : "rgba(255,255,255,0.4)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    transition: "background 0.2s ease, color 0.2s ease",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 190 }}>
              {!(goalTargetUSD > 0) ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  목표를 설정해보세요
                </div>
              ) : goalProgressLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  불러오는 중...
                </div>
              ) : goalProgressSeries.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  아직 등록된 자산이 없어요
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={goalProgressSeries} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="goalProgressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8FA7FF" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#8FA7FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="ts"
                      tickFormatter={(ts) => formatKstAxisLabel(ts, goalPeriod)}
                      tick={{
                        fontSize: 9,
                        fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                      }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis hide domain={["dataMin", "dataMax"]} />
                    <Tooltip
                      content={<GoalProgressTooltip />}
                      cursor={{ stroke: isLight ? "rgba(20,22,26,0.2)" : "rgba(255,255,255,0.2)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="percent"
                      stroke="#8FA7FF"
                      strokeWidth={2}
                      fill="url(#goalProgressGradient)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 벤치마크 모달 (홈 탭 "벤치마크" 클릭 시 표시): 선택한 지수(S&P500 등) 대비 내 포트폴리오의
          수익률(%)을 기간 시작 시점 기준으로 환산해 겹쳐 비교하는 그래프. 자산 추이/목표 모달과 동일한
          디자인(카드 크기, 기간 탭, 차트 레이아웃)을 그대로 따른다. */}
      {benchmarkModalOpen && (
        <div
          onClick={closeBenchmarkModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: benchmarkModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: benchmarkModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: benchmarkModalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: benchmarkModalVisible ? 1 : 0,
              transform: benchmarkModalVisible ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 4px 0",
                fontSize: 17,
                fontWeight: 600,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              벤치마크
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: BENCHMARK_PORTFOLIO_COLOR, flexShrink: 0 }} />
                <span style={{ color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)", fontWeight: 600, fontSize: 13 }}>
                  내 포트폴리오
                </span>
                <span style={{ color: isLight ? "#14161A" : "#FFFFFF" }}>
                  {benchmarkSeries.length > 0
                    ? `${benchmarkSeries[benchmarkSeries.length - 1].portfolioReturn >= 0 ? "+" : ""}${benchmarkSeries[
                        benchmarkSeries.length - 1
                      ].portfolioReturn.toFixed(2)}%`
                    : "-"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: BENCHMARK_INDEX_COLOR, flexShrink: 0 }} />
                <span style={{ color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)", fontWeight: 600, fontSize: 13 }}>
                  {BENCHMARK_OPTIONS.find((b) => b.key === selectedBenchmark)?.label}
                </span>
                <span style={{ color: isLight ? "#14161A" : "#FFFFFF" }}>
                  {benchmarkSeries.length > 0
                    ? `${benchmarkSeries[benchmarkSeries.length - 1].benchmarkReturn >= 0 ? "+" : ""}${benchmarkSeries[
                        benchmarkSeries.length - 1
                      ].benchmarkReturn.toFixed(2)}%`
                    : "-"}
                </span>
              </div>
            </div>

            {/* 1일/1주/3달/1년 기간 탭 - 지수 모달(IndexCandleChart)/자산 추이·목표 모달과 동일한 크기/레이아웃/위치 */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
              {INDEX_CANDLE_PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setBenchmarkPeriod(p.key)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 8,
                    border: "none",
                    background:
                      benchmarkPeriod === p.key
                        ? isLight
                          ? "rgba(20,22,26,0.14)"
                          : "rgba(255,255,255,0.14)"
                        : "transparent",
                    color:
                      benchmarkPeriod === p.key
                        ? isLight
                          ? "#14161A"
                          : "#FFFFFF"
                        : isLight
                        ? "rgba(20,22,26,0.4)"
                        : "rgba(255,255,255,0.4)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    transition: "background 0.2s ease, color 0.2s ease",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 190 }}>
              {!(grandTotalUSD > 0) ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  아직 등록된 자산이 없어요
                </div>
              ) : benchmarkLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  불러오는 중...
                </div>
              ) : benchmarkSeries.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 12,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                  }}
                >
                  비교 데이터를 불러올 수 없어요
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={benchmarkSeries} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="benchmarkPortfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BENCHMARK_PORTFOLIO_COLOR} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={BENCHMARK_PORTFOLIO_COLOR} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="ts"
                      tickFormatter={(ts) => formatKstAxisLabel(ts, benchmarkPeriod)}
                      tick={{
                        fontSize: 9,
                        fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                      }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis hide domain={["dataMin", "dataMax"]} />
                    <Tooltip
                      content={<BenchmarkTooltip />}
                      cursor={{ stroke: isLight ? "rgba(20,22,26,0.2)" : "rgba(255,255,255,0.2)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolioReturn"
                      stroke={BENCHMARK_PORTFOLIO_COLOR}
                      strokeWidth={2}
                      fill="url(#benchmarkPortfolioGradient)"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="benchmarkReturn"
                      stroke={BENCHMARK_INDEX_COLOR}
                      strokeWidth={2}
                      fill="transparent"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 종목 모달 */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: modalVisible
              ? "rgba(0, 0, 0, 0.45)"
              : "rgba(0, 0, 0, 0)",
            backdropFilter: modalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: modalVisible ? "blur(6px)" : "blur(0px)",
            transition: "background 0.35s ease, backdrop-filter 0.35s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(304px, 80vw)",
              padding: "22px 20px",
              borderRadius: 20,
              background: isLight ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
              opacity: modalVisible ? 1 : 0,
              transform: modalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 600,
                  color: (isLight ? "#14161A" : "#FFFFFF"),
                  letterSpacing: 0.2,
                }}
              >
                {editIndex !== null ? "수정하기" : "추가하기"}
              </h2>

              {/* 수정 모드: 삭제 버튼 - 닫기(X)로 착각해 실수로 삭제하는 걸 막기 위해 휴지통 아이콘 +
                  2단계 확인(한 번 더 누르면 진짜 삭제, 3초 안에 다시 누르지 않으면 자동 취소)으로 구성 */}
              {editIndex !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {deleteConfirming && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#FF8A8A",
                        whiteSpace: "nowrap",
                      }}
                    >
                      삭제할까요?
                    </span>
                  )}
                  <button
                    onClick={handleDeleteClick}
                    onMouseEnter={() => setDeleteHovered(true)}
                    onMouseLeave={() => setDeleteHovered(false)}
                    aria-label={deleteConfirming ? "삭제 확인" : "삭제"}
                    style={{
                      width: 26,
                      height: 26,
                      flexShrink: 0,
                      borderRadius: "50%",
                      border: `1px solid ${isLight ? "rgba(255,107,107,0.3)" : "rgba(255,107,107,0.35)"}`,
                      background: deleteConfirming
                        ? "#FF6B6B"
                        : deleteHovered
                        ? "rgba(255,107,107,0.22)"
                        : (isLight ? "rgba(255,107,107,0.08)" : "rgba(255,107,107,0.12)"),
                      color: deleteConfirming ? "#FFFFFF" : deleteHovered ? "#FF8A8A" : "rgba(255,138,138,0.85)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      outline: "none",
                      opacity: modalVisible ? 1 : 0,
                      transform: modalVisible
                        ? `translateX(0) scale(${deleteConfirming || deleteHovered ? 1.1 : 1})`
                        : "translateX(8px) scale(0.85)",
                      transition:
                        "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s ease, color 0.25s ease",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {assetType === "stock" ? (
              <>
                {/* 티커 / 종목명 (2열) */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabelStyle}>티커</label>
                    <input
                      type="text"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 0 }}
                      onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                      onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabelStyle}>종목명</label>
                    <input
                      type="text"
                      value={stockName}
                      onChange={(e) => setStockName(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 0 }}
                      onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                      onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }} />

                {/* 수량 / 단가 / 통화 (3열) */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={fieldLabelStyle}>수량</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatWithCommas(quantity)}
                      onChange={handleNumericChange(setQuantity)}
                      style={{ ...inputStyle, marginBottom: 0 }}
                      onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                      onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={fieldLabelStyle}>단가</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatWithCommas(price)}
                      onChange={handleNumericChange(setPrice)}
                      style={{ ...inputStyle, marginBottom: 0 }}
                      onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                      onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                    />
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <label style={fieldLabelStyle}>통화</label>
                    {/* ₩ / $ 토글 버튼 */}
                    <div
                      style={{
                        position: "relative",
                        display: "flex",
                        height: 42,
                        padding: 3,
                        borderRadius: 12,
                        background: (isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)"),
                        border: (isLight ? "1px solid rgba(20,22,26,0.1)" : "1px solid rgba(255,255,255,0.1)"),
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 3,
                          left: currencyIndicator.left,
                          width: currencyIndicator.width,
                          height: "calc(100% - 6px)",
                          borderRadius: 9,
                          background: (isLight ? "rgba(20,22,26,0.16)" : "rgba(255,255,255,0.16)"),
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                          transition:
                            "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                      />
                      {[
                        { key: "USD", label: "$" },
                        { key: "KRW", label: "₩" },
                      ].map((c, i) => (
                        <button
                          key={c.key}
                          ref={(el) => (currencyBtnRefs.current[i] = el)}
                          onClick={() => setCurrency(c.key)}
                          style={{
                            position: "relative",
                            zIndex: 1,
                            width: 26,
                            height: "100%",
                            border: "none",
                            background: "transparent",
                            borderRadius: 9,
                            color:
                              currency === c.key
                                ? (isLight ? "#14161A" : "#FFFFFF")
                                : (isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)"),
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            outline: "none",
                            transition: "color 0.3s ease",
                          }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }} />

                {/* 환율 (구매 시점 환율 기록용) */}
                <label
                  style={{
                    ...fieldLabelStyle,
                    opacity: currency === "USD" ? 1 : 0.3,
                    transition: "opacity 0.3s ease",
                  }}
                >
                  환율
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    opacity: currency === "USD" ? 1 : 0.3,
                    pointerEvents: currency === "USD" ? "auto" : "none",
                    transition: "opacity 0.3s ease",
                  }}
                >
                  <span style={{ fontSize: 14, color: (isLight ? "rgba(20,22,26,0.6)" : "rgba(255,255,255,0.6)"), flexShrink: 0 }}>
                    1 USD =
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatWithCommas(exchangeRate)}
                    onChange={handleNumericChange(setExchangeRate)}
                    disabled={currency !== "USD"}
                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                    onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                  />
                  <span style={{ fontSize: 14, color: (isLight ? "rgba(20,22,26,0.6)" : "rgba(255,255,255,0.6)"), flexShrink: 0 }}>
                    원
                  </span>
                </div>
                <div style={{ marginBottom: 14 }} />
              </>
            ) : (
              <>
                {/* 통화 */}
                <label style={fieldLabelStyle}>통화</label>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    height: 42,
                    padding: 4,
                    borderRadius: 12,
                    background: (isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)"),
                    border: (isLight ? "1px solid rgba(20,22,26,0.1)" : "1px solid rgba(255,255,255,0.1)"),
                    marginBottom: 20,
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: cashCurrencyIndicator.left,
                      width: cashCurrencyIndicator.width,
                      height: "calc(100% - 8px)",
                      borderRadius: 9,
                      background: (isLight ? "rgba(20,22,26,0.16)" : "rgba(255,255,255,0.16)"),
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                      transition:
                        "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                  {[
                    { key: "USD", label: "USD ($)" },
                    { key: "KRW", label: "KRW (₩)" },
                  ].map((c, i) => (
                    <button
                      key={c.key}
                      ref={(el) => (cashCurrencyBtnRefs.current[i] = el)}
                      onClick={() => setCashCurrency(c.key)}
                      style={{
                        position: "relative",
                        zIndex: 1,
                        flex: 1,
                        height: "100%",
                        border: "none",
                        background: "transparent",
                        borderRadius: 9,
                        color:
                          cashCurrency === c.key
                            ? (isLight ? "#14161A" : "#FFFFFF")
                            : (isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)"),
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        outline: "none",
                        transition: "color 0.3s ease",
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* 수량 */}
                <label style={fieldLabelStyle}>수량</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatWithCommas(cashAmount)}
                  onChange={handleNumericChange(setCashAmount)}
                  style={{ ...inputStyle, marginBottom: 20 }}
                  onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                  onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                />

                {/* 환율 (구매/입금 시점 환율 기록용) */}
                <label
                  style={{
                    ...fieldLabelStyle,
                    opacity: cashCurrency === "USD" ? 1 : 0.3,
                    transition: "opacity 0.3s ease",
                  }}
                >
                  환율
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    opacity: cashCurrency === "USD" ? 1 : 0.3,
                    pointerEvents: cashCurrency === "USD" ? "auto" : "none",
                    transition: "opacity 0.3s ease",
                  }}
                >
                  <span style={{ fontSize: 14, color: (isLight ? "rgba(20,22,26,0.6)" : "rgba(255,255,255,0.6)"), flexShrink: 0 }}>
                    1 USD =
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatWithCommas(cashExchangeRate)}
                    onChange={handleNumericChange(setCashExchangeRate)}
                    disabled={cashCurrency !== "USD"}
                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                    onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                  />
                  <span style={{ fontSize: 14, color: (isLight ? "rgba(20,22,26,0.6)" : "rgba(255,255,255,0.6)"), flexShrink: 0 }}>
                    원
                  </span>
                </div>
                <div style={{ marginBottom: 14 }} />
              </>
            )}

            {/* 취소 / 확인 */}
            <div style={{ display: "flex", gap: 9 }}>
              <button
                onClick={closeModal}
                onMouseEnter={() => setCancelHovered(true)}
                onMouseLeave={() => setCancelHovered(false)}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 12,
                  border: (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"),
                  background: cancelHovered
                    ? (isLight ? "rgba(20,22,26,0.1)" : "rgba(255,255,255,0.1)")
                    : (isLight ? "rgba(20,22,26,0.04)" : "rgba(255,255,255,0.04)"),
                  color: cancelHovered
                    ? (isLight ? "rgba(20,22,26,0.9)" : "rgba(255,255,255,0.9)")
                    : (isLight ? "rgba(20,22,26,0.6)" : "rgba(255,255,255,0.6)"),
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                  transition:
                    "background 0.25s ease, color 0.25s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                  transform: cancelHovered
                    ? "translateY(-1px)"
                    : "translateY(0)",
                }}
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                onMouseEnter={() => setConfirmHovered(true)}
                onMouseLeave={() => setConfirmHovered(false)}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 12,
                  border: (isLight ? "1px solid rgba(20,22,26,0.2)" : "1px solid rgba(255,255,255,0.2)"),
                  background: confirmHovered
                    ? (isLight ? "rgba(20,22,26,0.28)" : "rgba(255,255,255,0.28)")
                    : (isLight ? "rgba(20,22,26,0.18)" : "rgba(255,255,255,0.18)"),
                  color: (isLight ? "#14161A" : "#FFFFFF"),
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: confirmHovered
                    ? "0 6px 20px rgba(0,0,0,0.3)"
                    : "0 2px 8px rgba(0,0,0,0.2)",
                  transition:
                    "background 0.25s ease, box-shadow 0.25s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                  transform: confirmHovered
                    ? "translateY(-1px)"
                    : "translateY(0)",
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
