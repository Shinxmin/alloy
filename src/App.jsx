import React, { useState, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from "recharts";
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
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
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
    await supabase.auth.signOut();
  };
  const [hovered, setHovered] = useState(null);
  const [plusHovered, setPlusHovered] = useState(false);
  const [plusPressed, setPlusPressed] = useState(false);
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
  const assetTypeBtnRefs = useRef([]);
  const [assetTypeIndicator, setAssetTypeIndicator] = useState({ left: 0, width: 0 });

  // 기준환율 (원화 자산을 달러로 환산할 때 사용) - 새로고침마다 API로 자동 조회
  const [todayRate, setTodayRate] = useState(1300);
  const [rateLoaded, setRateLoaded] = useState(false);
  const [rateSource, setRateSource] = useState("default"); // "api" | "cache" | "default"

  useEffect(() => {
    try {
      const saved = localStorage.getItem("alloy_todayRate");
      const parsed = parseFloat(saved);
      if (isFinite(parsed) && parsed > 0) {
        setTodayRate(parsed);
        setRateSource("cache");
      }
    } catch (e) {}
    setRateLoaded(true);

    let cancelled = false;
    const fetchRate = async () => {
      // 1순위: Frankfurter (ECB 기준, 키 불필요, https://frankfurter.dev)
      try {
        const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=KRW");
        const data = await res.json();
        const rate = data && data.rates && data.rates.KRW;
        if (!cancelled && isFinite(rate) && rate > 0) {
          setTodayRate(rate);
          setRateSource("api");
          return;
        }
      } catch (e) {}

      // 2순위: ExchangeRate-API 오픈 액세스 (키 불필요, 매일 갱신)
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        const rate = data && data.rates && data.rates.KRW;
        if (!cancelled && isFinite(rate) && rate > 0) {
          setTodayRate(rate);
          setRateSource("api");
        }
      } catch (e) {}
    };
    fetchRate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rateLoaded) return;
    try {
      localStorage.setItem("alloy_todayRate", String(todayRate));
    } catch (e) {}
  }, [todayRate, rateLoaded]);

  // 환율 차트 모달 (최근 1개월 원달러 환율 추이)
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [rateHistory, setRateHistory] = useState([]);
  const [rateHistoryLoading, setRateHistoryLoading] = useState(false);
  const [rateHistoryError, setRateHistoryError] = useState(false);
  const [rateTextHovered, setRateTextHovered] = useState(false);

  const fetchRateHistory = async () => {
    setRateHistoryLoading(true);
    setRateHistoryError(false);
    try {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const res = await fetch(
        `https://api.frankfurter.dev/v1/${fmt(start)}..${fmt(end)}?from=USD&to=KRW`
      );
      const data = await res.json();
      const rates = data && data.rates;
      if (!rates || Object.keys(rates).length === 0) throw new Error("no rates");
      const parsed = Object.keys(rates)
        .sort()
        .map((date) => ({
          date: date.slice(5).replace("-", "/"),
          rate: rates[date].KRW,
        }));
      setRateHistory(parsed);
    } catch (e) {
      setRateHistoryError(true);
    } finally {
      setRateHistoryLoading(false);
    }
  };

  const openRateModal = () => {
    setRateModalOpen(true);
    requestAnimationFrame(() => setRateModalVisible(true));
    fetchRateHistory();
  };

  const closeRateModal = () => {
    setRateModalVisible(false);
    setTimeout(() => setRateModalOpen(false), 300);
  };
  const closeRateModalRef = useRef(closeRateModal);
  closeRateModalRef.current = closeRateModal;

  // S&P500 지수(실시간) - 홈 탭 상단, 클릭 시 최근 30일 추이 차트 모달 (야후 파이낸스, API 키 불필요)
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

  // 나스닥 종합지수(실시간) - 홈 탭 상단, 클릭 시 최근 30일 추이 차트 모달 (야후 파이낸스, API 키 불필요)
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

  // 종목 정보 모달 (종목 클릭 시 표시, TradingView 위젯으로 가격 차트 표시)
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoHolding, setInfoHolding] = useState(null);
  const infoChartContainerRef = useRef(null);

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

  // 티커가 순수 영문(알파벳)일 때만 TradingView에서 종목을 찾을 수 있음 (숫자/한글 티커는 차트 미지원)
  const isChartableTicker = (ticker) => /^[A-Za-z.\-]+$/.test(ticker || "");

  // 정보 모달이 열리면 TradingView 심볼 개요 위젯을 삽입 (티커명으로 종목 조회, 영문 티커만 지원)
  useEffect(() => {
    if (!infoModalOpen || !infoHolding) return;
    const container = infoChartContainerRef.current;
    if (!container) return;
    container.innerHTML = "";

    if (!isChartableTicker(infoHolding.ticker)) return;

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.async = true;
    script.text = JSON.stringify({
      symbols: [[infoHolding.ticker]],
      chartOnly: true,
      width: "100%",
      height: "180",
      locale: "kr",
      timezone: "Asia/Seoul",
      colorTheme: isLight ? "light" : "dark",
      isTransparent: true,
      autosize: false,
      showVolume: false,
      hideDateRanges: false,
      dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D"],
      hideMarketStatus: true,
      hideSymbolLogo: true,
      scalePosition: "no",
      scaleMode: "Normal",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      valuesTracking: "1",
      changeMode: "price-and-percent",
      lineWidth: 2,
      lineType: 0,
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [infoModalOpen, infoHolding, isLight]);

  // 숫자 티커(원화 종목)는 KRX 시세 히스토리로 자체 차트를 그림 (TradingView는 숫자 티커를 지원하지 않음)
  const [infoHistory, setInfoHistory] = useState([]);
  const [infoHistoryLoading, setInfoHistoryLoading] = useState(false);

  useEffect(() => {
    if (!infoModalOpen || !infoHolding || !isNumericTicker(infoHolding.ticker)) {
      setInfoHistory([]);
      return;
    }
    let cancelled = false;
    setInfoHistoryLoading(true);
    setInfoHistory([]);
    supabase.functions
      .invoke("stock-history-proxy", {
        body: { ticker: infoHolding.ticker },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setInfoHistoryLoading(false);
        if (error || !Array.isArray(data?.history)) {
          setInfoHistory([]);
          return;
        }
        setInfoHistory(data.history);
      })
      .catch(() => {
        if (!cancelled) setInfoHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [infoModalOpen, infoHolding]);

  // 모달(종목 추가/수정, 환율 차트, 지수 차트, 터미널 명령어 패널)이 떠 있는 동안 배경 스크롤 방지
  useEffect(() => {
    const anyModalOpen =
      modalOpen ||
      rateModalOpen ||
      infoModalOpen ||
      snp500IndexModalOpen ||
      nasdaqIndexModalOpen ||
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
  }, [modalOpen, rateModalOpen, infoModalOpen, snp500IndexModalOpen, nasdaqIndexModalOpen, chatOpen]);

  useEffect(() => {
    const idx = currency === "KRW" ? 0 : 1;
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

  useEffect(() => {
    const idx = assetType === "stock" ? 0 : 1;
    const el = assetTypeBtnRefs.current[idx];
    if (el) {
      setAssetTypeIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [assetType, modalOpen]);

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

  const openModal = () => {
    setActive(1);
    setPlusHovered(false);
    setPlusPressed(false);
    resetForm();
    setEditIndex(null);
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  };

  const openEditModal = (type, index) => {
    setActive(1);
    setPlusHovered(false);
    setPlusPressed(false);
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
    setTimeout(() => {
      setModalOpen(false);
      setEditIndex(null);
    }, 300);
  };

  const [holdings, setHoldings] = useState([]); // [{ ticker, quantity, avgPrice, currency, exchangeRate }]
  const [cashHoldings, setCashHoldings] = useState([]); // [{ currency, amount, exchangeRate }]
  const [dataLoaded, setDataLoaded] = useState(false);

  // 숫자로만 구성된 티커(원화 종목 코드, 예: 005930)만 KRX 시세/수익률/차트 대상
  const isNumericTicker = (ticker) => /^[0-9]+$/.test(ticker || "");

  // 보유 종목 현재가 (수익률 계산용) - Supabase Edge Function(stock-price-proxy)을 통해 KRX Open API로 조회 (숫자 티커만 지원)
  const [stockPrices, setStockPrices] = useState({});
  const holdingsTickerKey = holdings.map((h) => `${h.ticker}:${h.currency}`).join(",");

  useEffect(() => {
    const numericHoldings = holdings.filter((h) => isNumericTicker(h.ticker));
    if (numericHoldings.length === 0) {
      setStockPrices({});
      return;
    }
    let cancelled = false;
    supabase.functions
      .invoke("stock-price-proxy", {
        body: { holdings: numericHoldings.map((h) => ({ ticker: h.ticker, currency: h.currency })) },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.prices) {
          setStockPrices({});
          return;
        }
        setStockPrices(data.prices);
      })
      .catch(() => {
        if (!cancelled) setStockPrices({});
      });
    return () => {
      cancelled = true;
    };
  }, [holdingsTickerKey]);

  // 로그인한 사용자의 Supabase portfolios 테이블에서 데이터 불러오기
  useEffect(() => {
    if (!session) {
      setHoldings([]);
      setCashHoldings([]);
      setDataLoaded(false);
      return;
    }
    let cancelled = false;
    setDataLoaded(false);
    supabase
      .from("portfolios")
      .select("holdings, cash_holdings")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          if (Array.isArray(data.holdings)) setHoldings(data.holdings);
          if (Array.isArray(data.cash_holdings)) setCashHoldings(data.cash_holdings);
        } else if (error) {
          console.error("포트폴리오 불러오기 실패:", error.message);
        }
        setDataLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // holdings / cashHoldings 변경 시마다 Supabase에 저장 (최초 로드 완료 이후에만)
  useEffect(() => {
    if (!dataLoaded || !session) return;
    supabase
      .from("portfolios")
      .upsert({
        user_id: session.user.id,
        holdings,
        cash_holdings: cashHoldings,
        updated_at: new Date().toISOString(),
      })
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

  const saveNickname = async (value) => {
    const trimmed = value.trim();
    setNicknameEditing(false);
    if (!trimmed || trimmed === nickname || !session) return;
    setNickname(trimmed);
    await supabase.from("profiles").upsert({
      user_id: session.user.id,
      nickname: trimmed,
      updated_at: new Date().toISOString(),
    });
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
        } else if (rateModalOpen) {
          e.preventDefault();
          closeRateModalRef.current();
        } else if (snp500IndexModalOpen) {
          e.preventDefault();
          closeSnp500IndexModalRef.current();
        } else if (nasdaqIndexModalOpen) {
          e.preventDefault();
          closeNasdaqIndexModalRef.current();
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
    rateModalOpen,
    infoModalOpen,
    snp500IndexModalOpen,
    nasdaqIndexModalOpen,
    chatOpen,
    chatSortMode,
    pendingCommand,
    chatDoneNotice,
  ]);

  const handleDelete = () => {
    if (editIndex === null) {
      closeModal();
      return;
    }
    if (assetType === "cash") {
      setCashHoldings((prev) => prev.filter((_, i) => i !== editIndex));
    } else {
      setHoldings((prev) => prev.filter((_, i) => i !== editIndex));
    }
    closeModal();
  };

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

  const stockHoldings = holdings.map((h, i) => {
    const value = h.avgPrice * h.quantity; // 표기용 (원래 입력 통화)
    const usdValue = toUSD(h);
    const percent =
      grandTotalUSD > 0 ? Math.round((usdValue / grandTotalUSD) * 100) : 0;
    const currentPrice = isNumericTicker(h.ticker) ? stockPrices[h.ticker] : undefined;
    const hasCurrentPrice = isFinite(currentPrice) && currentPrice > 0;
    const gainAmount = hasCurrentPrice ? (currentPrice - h.avgPrice) * h.quantity : null;
    const returnPercent = hasCurrentPrice && h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : null;
    return {
      ticker: h.ticker,
      name: h.name || "",
      currency: h.currency,
      avgPrice: h.avgPrice,
      currentPrice: hasCurrentPrice ? currentPrice : null,
      gainAmount,
      returnPercent,
      percent,
      value: formatAmount(value, h.currency),
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
              margin: "0 0 20px 0",
              fontSize: 15,
              fontWeight: 600,
              color: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)",
            }}
          >
            {authMode === "signUp" ? "회원가입" : "로그인"}
          </h2>

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
                  홈
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

                {/* 추가하기 + 버튼 (리퀴드 글래스, 모든 탭에서 노출) */}
                <button
                  onClick={openModal}
                  onMouseEnter={() => setPlusHovered(true)}
                  onMouseLeave={() => setPlusHovered(false)}
                  onMouseDown={() => setPlusPressed(true)}
                  onMouseUp={() => setPlusPressed(false)}
                  aria-label="추가하기"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: isLight
                      ? "1px solid rgba(20,22,26,0.14)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: plusHovered
                      ? isLight
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.14)"
                      : isLight
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: plusHovered
                      ? isLight
                        ? "0 6px 20px rgba(20,22,26,0.14), inset 0 1px 0 rgba(255,255,255,0.6)"
                        : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : isLight
                      ? "0 4px 14px rgba(20,22,26,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    color: isLight ? "#14161A" : "#FFFFFF",
                    fontSize: 20,
                    fontWeight: 400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    transition:
                      "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: plusPressed
                      ? "scale(0.9) translateY(0)"
                      : plusHovered
                      ? "scale(1.08) translateY(-2px)"
                      : "scale(1) translateY(0)",
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* 지수 위젯(S&P500, 나스닥) - 홈 탭 상단 중앙, 클릭 시 각각 최근 30일 추이 차트 모달 */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 36,
                marginTop: 56,
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

                {/* 추가하기 + 버튼 (리퀴드 글래스, 모든 탭에서 노출) */}
                <button
                  onClick={openModal}
                  onMouseEnter={() => setPlusHovered(true)}
                  onMouseLeave={() => setPlusHovered(false)}
                  onMouseDown={() => setPlusPressed(true)}
                  onMouseUp={() => setPlusPressed(false)}
                  aria-label="추가하기"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: isLight
                      ? "1px solid rgba(20,22,26,0.14)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: plusHovered
                      ? isLight
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.14)"
                      : isLight
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: plusHovered
                      ? isLight
                        ? "0 6px 20px rgba(20,22,26,0.14), inset 0 1px 0 rgba(255,255,255,0.6)"
                        : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : isLight
                      ? "0 4px 14px rgba(20,22,26,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    color: isLight ? "#14161A" : "#FFFFFF",
                    fontSize: 20,
                    fontWeight: 400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    transition:
                      "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: plusPressed
                      ? "scale(0.9) translateY(0)"
                      : plusHovered
                      ? "scale(1.08) translateY(-2px)"
                      : "scale(1) translateY(0)",
                  }}
                >
                  +
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
                    $ {Math.round(displayTotalUSD).toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: (isLight ? "#14161A" : "#FFFFFF"),
                    }}
                  >
                    ₩ {Math.round(displayTotalKRW).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* 기준환율 표시 (원화 자산 → 달러 환산에 사용, API에서 자동 조회) */}
            {!isEmpty && (
              <div
                onClick={openRateModal}
                onMouseEnter={() => setRateTextHovered(true)}
                onMouseLeave={() => setRateTextHovered(false)}
                role="button"
                tabIndex={0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginBottom: 28,
                  cursor: "pointer",
                  opacity: rateTextHovered ? 0.7 : 1,
                  transition: "opacity 0.2s ease",
                  outline: "none",
                }}
              >
                {rateSource === "api" && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#39FF8A",
                      boxShadow:
                        "0 0 6px 2px rgba(57,255,138,0.85), 0 0 2px rgba(57,255,138,1)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: (isLight ? "rgba(20,22,26,0.75)" : "rgba(255,255,255,0.85)"),
                  }}
                >
                  1 USD = {Math.round(todayRate).toLocaleString()}원
                </span>
              </div>
            )}

            {/* 카테고리별 종목 */}
            {!isEmpty &&
              Object.entries(portfolio).map(([key, category]) =>
                category.holdings.length === 0 ? null : (
                  <div
                    key={key}
                    style={{
                      padding: draggedInfo && draggedInfo.key === key ? "12px" : "0",
                      margin:
                        draggedInfo && draggedInfo.key === key
                          ? "0 -12px 36px -12px"
                          : "0 0 36px 0",
                      borderRadius: 14,
                      border:
                        draggedInfo && draggedInfo.key === key
                          ? "1.5px dashed rgba(143,167,255,0.55)"
                          : "1.5px dashed transparent",
                      transition: "border 0.2s ease, padding 0.2s ease, margin 0.2s ease",
                    }}
                  >
                    <h2
                      style={{
                        margin: "0 0 14px 0",
                        fontSize: 18,
                        fontWeight: 700,
                        color: (isLight ? "#14161A" : "#FFFFFF"),
                      }}
                    >
                      {category.label}
                    </h2>

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
                              {isNumericTicker(h.ticker) && h.gainAmount !== null && (
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: h.gainAmount >= 0 ? "#FF5C5C" : "#4D9FFF",
                                    flexShrink: 0,
                                  }}
                                >
                                  {h.gainAmount >= 0 ? "+ " : "- "}
                                  {formatAmount(Math.abs(h.gainAmount), h.currency)} (
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
                            </span>
                            <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: (isLight ? "#14161A" : "#FFFFFF"),
                                }}
                              >
                                {c.amount}
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
                <div style={{ fontSize: 13, color: (isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)") }}>
                  하단의 + 버튼을 눌러 자산을 추가해보세요
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

                {/* 추가하기 + 버튼 (리퀴드 글래스, 모든 탭에서 노출) */}
                <button
                  onClick={openModal}
                  onMouseEnter={() => setPlusHovered(true)}
                  onMouseLeave={() => setPlusHovered(false)}
                  onMouseDown={() => setPlusPressed(true)}
                  onMouseUp={() => setPlusPressed(false)}
                  aria-label="추가하기"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: isLight
                      ? "1px solid rgba(20,22,26,0.14)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: plusHovered
                      ? isLight
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.14)"
                      : isLight
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: plusHovered
                      ? isLight
                        ? "0 6px 20px rgba(20,22,26,0.14), inset 0 1px 0 rgba(255,255,255,0.6)"
                        : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : isLight
                      ? "0 4px 14px rgba(20,22,26,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    color: isLight ? "#14161A" : "#FFFFFF",
                    fontSize: 20,
                    fontWeight: 400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    transition:
                      "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: plusPressed
                      ? "scale(0.9) translateY(0)"
                      : plusHovered
                      ? "scale(1.08) translateY(-2px)"
                      : "scale(1) translateY(0)",
                  }}
                >
                  +
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

            {/* 계정 카테고리 (포트폴리오 탭 카테고리 텍스트와 동일한 스타일) */}
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
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3.2 3 10.5V20a1 1 0 0 0 1 1h5.5v-6.5h5V21H19a1 1 0 0 0 1-1v-9.5L12 3.2z" />
                    </svg>
                    <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: 0.2, lineHeight: 1 }}>
                      홈
                    </span>
                  </span>
                ) : i === 2 ? (
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="8" r="3.6" />
                      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1z" />
                    </svg>
                    <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: 0.2, lineHeight: 1 }}>
                      설정
                    </span>
                  </span>
                ) : (
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="13" width="4" height="7" rx="1" />
                      <rect x="10" y="8" width="4" height="12" rx="1" />
                      <rect x="16" y="3" width="4" height="17" rx="1" />
                    </svg>
                    <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: 0.2, lineHeight: 1 }}>
                      투자
                    </span>
                  </span>
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

      {/* 환율 차트 모달 (최근 1개월 원달러 환율 추이, 추가하기 모달과 동일한 크기) */}
      {rateModalOpen && (
        <div
          onClick={closeRateModal}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: rateModalVisible ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)",
            backdropFilter: rateModalVisible ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: rateModalVisible ? "blur(6px)" : "blur(0px)",
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
              opacity: rateModalVisible ? 1 : 0,
              transform: rateModalVisible
                ? "scale(1) translateY(0)"
                : "scale(0.9) translateY(16px)",
              transition:
                "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 600,
                  color: isLight ? "#14161A" : "#FFFFFF",
                  letterSpacing: 0.2,
                }}
              >
                환율
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                }}
              >
                (KRW/USD) 최근 1개월
              </span>
            </div>

            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: isLight ? "#14161A" : "#FFFFFF",
                marginBottom: 14,
              }}
            >
              {Math.round(todayRate).toLocaleString()}원
            </div>

            <div style={{ width: "100%", height: 150 }}>
              {rateHistoryLoading ? (
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
              ) : rateHistoryError || rateHistory.length === 0 ? (
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
                  환율 정보를 불러올 수 없어요
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rateHistory} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={isLight ? "#14161A" : "#FFFFFF"}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={isLight ? "#14161A" : "#FFFFFF"}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{
                        fontSize: 9,
                        fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                      }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                    <Tooltip
                      contentStyle={{
                        background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
                        border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                        borderRadius: 10,
                        fontSize: 11,
                        padding: "6px 10px",
                      }}
                      labelStyle={{
                        color: isLight ? "#14161A" : "#FFFFFF",
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                      itemStyle={{ color: isLight ? "#14161A" : "#FFFFFF" }}
                      formatter={(value) => [`${Math.round(value).toLocaleString()}원`, "환율"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="rate"
                      stroke={isLight ? "#14161A" : "#FFFFFF"}
                      strokeWidth={2}
                      fill="url(#rateGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* S&P500 지수 차트 모달 (최근 30일 종가 추이, 환율 모달과 동일한 크기/스타일) */}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 600,
                  color: isLight ? "#14161A" : "#FFFFFF",
                  letterSpacing: 0.2,
                }}
              >
                {snp500Index.name}
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                }}
              >
                최근 30일
              </span>
            </div>

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

            <div style={{ width: "100%", height: 150 }}>
              {snp500Index.history.length === 0 ? (
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
                  지수 정보를 불러올 수 없어요
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={snp500Index.history} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="snp500IndexGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={isLight ? "#14161A" : "#FFFFFF"}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={isLight ? "#14161A" : "#FFFFFF"}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{
                        fontSize: 9,
                        fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                      }}
                      tickFormatter={(d) => d.slice(5).replace("-", "/")}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                    <Tooltip
                      contentStyle={{
                        background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
                        border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                        borderRadius: 10,
                        fontSize: 11,
                        padding: "6px 10px",
                      }}
                      labelStyle={{
                        color: isLight ? "#14161A" : "#FFFFFF",
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                      itemStyle={{ color: isLight ? "#14161A" : "#FFFFFF" }}
                      formatter={(value) => [
                        Number(value).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                        snp500Index.name,
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={isLight ? "#14161A" : "#FFFFFF"}
                      strokeWidth={2}
                      fill="url(#snp500IndexGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 나스닥 지수 차트 모달 (최근 30일 종가 추이, S&P500 지수 모달과 동일한 크기/스타일) */}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 600,
                  color: isLight ? "#14161A" : "#FFFFFF",
                  letterSpacing: 0.2,
                }}
              >
                {nasdaqIndex.name}
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                }}
              >
                최근 30일
              </span>
            </div>

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

            <div style={{ width: "100%", height: 150 }}>
              {nasdaqIndex.history.length === 0 ? (
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
                  지수 정보를 불러올 수 없어요
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={nasdaqIndex.history} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="nasdaqIndexGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={isLight ? "#14161A" : "#FFFFFF"}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={isLight ? "#14161A" : "#FFFFFF"}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{
                        fontSize: 9,
                        fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                      }}
                      tickFormatter={(d) => d.slice(5).replace("-", "/")}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                    <Tooltip
                      contentStyle={{
                        background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
                        border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                        borderRadius: 10,
                        fontSize: 11,
                        padding: "6px 10px",
                      }}
                      labelStyle={{
                        color: isLight ? "#14161A" : "#FFFFFF",
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                      itemStyle={{ color: isLight ? "#14161A" : "#FFFFFF" }}
                      formatter={(value) => [
                        Number(value).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                        nasdaqIndex.name,
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={isLight ? "#14161A" : "#FFFFFF"}
                      strokeWidth={2}
                      fill="url(#nasdaqIndexGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

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

            {isNumericTicker(infoHolding.ticker) && infoHolding.currentPrice != null && (
              <div style={{ margin: "10px 0 2px 0" }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#FFFFFF",
                  }}
                >
                  {formatAmount(infoHolding.currentPrice, infoHolding.currency)}
                </span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "10px 0 16px 0" }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              >
                {formatAmount(infoHolding.avgPrice, infoHolding.currency)}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                }}
              >
                평균단가
              </span>
            </div>

            {isNumericTicker(infoHolding.ticker) ? (
              <div
                style={{
                  width: "100%",
                  height: 180,
                  borderRadius: 16,
                  padding: 10,
                  boxSizing: "border-box",
                  background: isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(16px) saturate(180%)",
                  WebkitBackdropFilter: "blur(16px) saturate(180%)",
                  border: `1px solid ${isLight ? "rgba(20,22,26,0.08)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                {infoHistoryLoading ? (
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
                ) : infoHistory.length === 0 ? (
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
                    시세 정보를 불러올 수 없어요
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={infoHistory} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="stockInfoGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={infoHolding.color || "#8FA7FF"} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={infoHolding.color || "#8FA7FF"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{
                          fontSize: 9,
                          fill: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                        }}
                        tickFormatter={(d) => d.slice(5).replace("-", "/")}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
                      <Tooltip
                        contentStyle={{
                          background: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,36,0.92)",
                          border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                          borderRadius: 10,
                          fontSize: 11,
                          padding: "6px 10px",
                        }}
                        labelStyle={{
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontWeight: 600,
                          marginBottom: 2,
                        }}
                        itemStyle={{ color: isLight ? "#14161A" : "#FFFFFF" }}
                        labelFormatter={(d) => d}
                        formatter={(value) => [formatAmount(value, "KRW"), "종가"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={infoHolding.color || "#8FA7FF"}
                        strokeWidth={2}
                        fill="url(#stockInfoGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              <div style={{ width: "100%", height: 180, position: "relative" }}>
                <div ref={infoChartContainerRef} style={{ width: "100%", height: "100%" }} />
                {!isChartableTicker(infoHolding.ticker) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: isLight ? "rgba(20,22,26,0.4)" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    차트가 지원되지 않는 종목입니다
                  </div>
                )}
              </div>
            )}
            {isChartableTicker(infoHolding.ticker) && !isNumericTicker(infoHolding.ticker) && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 6,
                  fontSize: 10,
                  opacity: 0.4,
                }}
              >
                <a
                  href="https://www.tradingview.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: isLight ? "#14161A" : "#FFFFFF",
                    textDecoration: "none",
                  }}
                >
                  TradingView 제공
                </a>
              </div>
            )}
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

              {/* 수정 모드: 삭제 X 버튼 */}
              {editIndex !== null && (
                <button
                  onClick={handleDelete}
                  onMouseEnter={() => setDeleteHovered(true)}
                  onMouseLeave={() => setDeleteHovered(false)}
                  aria-label="삭제"
                  style={{
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: `1px solid ${isLight ? "rgba(255,107,107,0.3)" : "rgba(255,107,107,0.35)"}`,
                    background: deleteHovered
                      ? "rgba(255,107,107,0.22)"
                      : (isLight ? "rgba(255,107,107,0.08)" : "rgba(255,107,107,0.12)"),
                    color: deleteHovered ? "#FF8A8A" : "rgba(255,138,138,0.85)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    outline: "none",
                    opacity: modalVisible ? 1 : 0,
                    transform: modalVisible
                      ? `translateX(0) scale(${deleteHovered ? 1.1 : 1})`
                      : "translateX(8px) scale(0.85)",
                    transition:
                      "opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s ease, color 0.25s ease",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M5 5l14 14M19 5L5 19" />
                  </svg>
                </button>
              )}

              {/* 주식 / 현금 스위치 (수정 모드에선 숨김) */}
              {editIndex === null && (
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  height: 30,
                  padding: 3,
                  borderRadius: 10,
                  background: (isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)"),
                  border: (isLight ? "1px solid rgba(20,22,26,0.1)" : "1px solid rgba(255,255,255,0.1)"),
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 3,
                    left: assetTypeIndicator.left,
                    width: assetTypeIndicator.width,
                    height: "calc(100% - 6px)",
                    borderRadius: 7,
                    background: (isLight ? "rgba(20,22,26,0.16)" : "rgba(255,255,255,0.16)"),
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                    transition:
                      "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
                {[
                  { key: "stock", label: "주식" },
                  { key: "cash", label: "현금" },
                ].map((a, i) => (
                  <button
                    key={a.key}
                    ref={(el) => (assetTypeBtnRefs.current[i] = el)}
                    onClick={() => setAssetType(a.key)}
                    onMouseEnter={(e) => {
                      if (assetType !== a.key)
                        e.currentTarget.style.color = (isLight ? "rgba(20,22,26,0.85)" : "rgba(255,255,255,0.85)");
                    }}
                    onMouseLeave={(e) => {
                      if (assetType !== a.key)
                        e.currentTarget.style.color = (isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)");
                    }}
                    style={{
                      position: "relative",
                      zIndex: 1,
                      padding: "0 10px",
                      height: "100%",
                      border: "none",
                      background: "transparent",
                      borderRadius: 7,
                      color:
                        assetType === a.key ? (isLight ? "#14161A" : "#FFFFFF") : (isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)"),
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                      transition: "color 0.25s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
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
                        { key: "KRW", label: "₩" },
                        { key: "USD", label: "$" },
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
