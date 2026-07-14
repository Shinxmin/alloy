import React, { useState, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { supabase } from "./supabaseClient";

export default function Alloy() {
  const tabs = ["A", "B", "C"];
  const [active, setActive] = useState(0);

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

  const toggleChat = () => {
    if (chatOpen) {
      setChatVisible(false);
      setTimeout(() => setChatOpen(false), 300);
    } else {
      setChatOpen(true);
      requestAnimationFrame(() => setChatVisible(true));
    }
  };

  const handleChatSend = () => {
    setChatMessage("");
  };

  const [theme, setTheme] = useState("dark"); // "dark" | "light"
  const [themeHovered, setThemeHovered] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const isLight = theme === "light";

  // 저장된 테마 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem("alloy_theme");
      if (saved === "light") setTheme("light");
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
      .then(() => {});
  }, [holdings, cashHoldings, dataLoaded, session]);

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
        if (modalOpen) {
          e.preventDefault();
          closeModalRef.current();
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
  }, [modalOpen, chatOpen]);

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

  const stockHoldings = holdings.map((h, i) => {
    const value = h.avgPrice * h.quantity; // 표기용 (원래 입력 통화)
    const usdValue = toUSD(h);
    const percent =
      grandTotalUSD > 0 ? Math.round((usdValue / grandTotalUSD) * 100) : 0;
    return {
      ticker: h.ticker,
      percent,
      value: formatAmount(value, h.currency),
      avgPrice: formatAmount(h.avgPrice, h.currency),
      shares: `${h.quantity.toLocaleString()}주`,
      color: palette[hashToIndex(h.ticker, palette.length)],
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

  const inputStyle = {
    width: "100%",
    height: 42,
    padding: "0 14px",
    marginBottom: 16,
    borderRadius: 12,
    border: (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"),
    background: (isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)"),
    color: (isLight ? "#14161A" : "#FFFFFF"),
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "background 0.25s ease, border 0.25s ease",
  };

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: "100vh",
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
          minHeight: "100vh",
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
        minHeight: "100vh",
        width: "100%",
        position: "relative",
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

      {/* 전체 화면을 항상 덮는 고정 배경 레이어 */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: isLight ? "#F8F9FA" : "#17191D",
          zIndex: -1,
          transition: "background 0.3s ease",
        }}
      />

      {/* 탭 콘텐츠 영역 */}
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          boxSizing: "border-box",
          padding: "22px 20px 140px 20px",
        }}
      >
        {active === 0 && (
          <>
            {/* 상단 헤더: 제목 + 테마 토글 (B탭 헤더 참고) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
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
                  onClick={toggleTheme}
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
          </>
        )}

        {active === 1 && (
          <>
            {/* 상단 헤더: 제목 + 테마 토글 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
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
                  onClick={toggleTheme}
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginBottom: 28,
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
                            onClick={() => openEditModal("stock", h.originalIndex)}
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
                              borderBottom:
                                i < category.holdings.length - 1
                                  ? (isLight ? "1px solid rgba(20,22,26,0.08)" : "1px solid rgba(255,255,255,0.08)")
                                  : "none",
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
                                    {h.ticker}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: (isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)"),
                                      marginLeft: 5,
                                    }}
                                  >
                                    ({h.percent}%)
                                  </span>
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
                                  평균 단가 {h.avgPrice}
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
                              borderBottom:
                                i < category.holdings.length - 1
                                  ? (isLight ? "1px solid rgba(20,22,26,0.08)" : "1px solid rgba(255,255,255,0.08)")
                                  : "none",
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
                                  color: (isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.55)"),
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
                <div style={{ fontSize: 13, color: (isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)") }}>
                  하단의 + 버튼을 눌러 자산을 추가해보세요
                </div>
              </div>
            )}
          </>
        )}

        {active === 2 && (
          <>
            {/* 상단 헤더: 제목 + 테마 토글 (A탭과 동일한 위치/구성) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
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
                  onClick={toggleTheme}
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

            {/* 로그인 계정 정보 및 로그아웃 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 14,
                background: isLight ? "rgba(20,22,26,0.04)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${isLight ? "rgba(20,22,26,0.1)" : "rgba(255,255,255,0.1)"}`,
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

      {/* 명령어 입력창 패널 (리퀴드 글래스, 탭바 위에 슬라이드로 등장) */}
      {chatOpen && (
        <>
          <div onClick={toggleChat} style={{ position: "fixed", inset: 0, zIndex: 9 }} />
          <div
            style={{
              position: "fixed",
              bottom: 24 + BAR_HEIGHT + 14,
              left: "50%",
              zIndex: 10,
              width: "min(360px, 88vw)",
              opacity: chatVisible ? 1 : 0,
              transform: chatVisible
                ? "translate(-50%, 0)"
                : "translate(-50%, 16px)",
              transition:
                "opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "0 6px 8px",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                }}
              >
                터미널
              </span>
              <div
                style={{
                  width: 84,
                  height: 4,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.14)",
                }}
              >
                <div
                  style={{
                    width: "45%",
                    height: "100%",
                    borderRadius: 999,
                    background: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.65)",
                  }}
                />
              </div>
            </div>
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
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.14)",
                  }}
                >
                  <div
                    style={{
                      width: "50%",
                      height: "100%",
                      borderRadius: 999,
                      background: isLight ? "rgba(20,22,26,0.55)" : "rgba(255,255,255,0.65)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 0.2,
                    color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                    flexShrink: 0,
                  }}
                >
                  50%
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
              <input
                type="text"
                autoFocus
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="명령어를 입력하세요"
                style={{
                  flex: 1,
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: "none",
                  background: "transparent",
                  color: isLight ? "#14161A" : "#FFFFFF",
                  fontSize: 14,
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
              </div>
            </div>
          </div>
        </>
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
                {/* 티커 */}
                <label style={fieldLabelStyle}>티커</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                  onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                />

                {/* 수량 */}
                <label style={fieldLabelStyle}>수량</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatWithCommas(quantity)}
                  onChange={handleNumericChange(setQuantity)}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                  onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                />

                {/* 단가 */}
                <label style={fieldLabelStyle}>단가</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatWithCommas(price)}
                    onChange={handleNumericChange(setPrice)}
                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    onFocus={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.35)" : "1px solid rgba(255,255,255,0.35)"))}
                    onBlur={(e) => (e.target.style.border = (isLight ? "1px solid rgba(20,22,26,0.12)" : "1px solid rgba(255,255,255,0.12)"))}
                  />

                  {/* ₩ / $ 토글 버튼 */}
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      height: 42,
                      padding: 4,
                      borderRadius: 12,
                      background: (isLight ? "rgba(20,22,26,0.05)" : "rgba(255,255,255,0.05)"),
                      border: (isLight ? "1px solid rgba(20,22,26,0.1)" : "1px solid rgba(255,255,255,0.1)"),
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        left: currencyIndicator.left,
                        width: currencyIndicator.width,
                        height: "calc(100% - 8px)",
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
                          width: 34,
                          height: "100%",
                          border: "none",
                          background: "transparent",
                          borderRadius: 9,
                          color:
                            currency === c.key
                              ? (isLight ? "#14161A" : "#FFFFFF")
                              : (isLight ? "rgba(20,22,26,0.5)" : "rgba(255,255,255,0.5)"),
                          fontSize: 14,
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
