import React, { useState, useRef, useEffect } from "react";

// 앱 버전 표기
const APP_VERSION = "0.2.1";

export default function Alloy() {
  const tabs = ["A", "B", "C"];
  // 상단 바 제목 - 홈 탭만 "Vaulty" 브랜드를 보여주고, 아직 기능이 없는 나머지 두 탭은 비워둔다.
  const TAB_TITLES = ["Vaulty", "", ""];
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

  const [theme, setTheme] = useState("dark"); // "dark" | "light" | "sunset" | "forest"
  const THEME_SWATCHES = {
    light: "#F4F3EE",
    dark: "#141413",
    sunset: "radial-gradient(circle at 50% 50%, #47301e 0%, #2a1f1a 55%, #17191D 95%)",
    forest: "radial-gradient(circle at 50% 50%, #1f3d28 0%, #1a2a20 55%, #17191D 95%)",
  };
  const [themeLoaded, setThemeLoaded] = useState(false);
  const isLight = theme === "light";

  useEffect(() => {
    try {
      const saved = localStorage.getItem("alloy_theme");
      if (saved === "light" || saved === "sunset" || saved === "forest") setTheme(saved);
    } catch (e) {}
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    try {
      localStorage.setItem("alloy_theme", theme);
    } catch (e) {}
  }, [theme, themeLoaded]);

  const [hovered, setHovered] = useState(null);
  const btnRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = btnRefs.current[active];
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [active, isLight]);

  const BAR_HEIGHT = 58;

  // 하단 바의 검색 바 - Cloudflare R2 연동 전이라 아직 실제 검색은 수행하지 않고 입력값만 들고 있는다.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // 상단 헤더(제목) 스티키 공통 스타일: 스크롤해도 화면 최상단에 계속 고정되어 보이고,
  // 탭 콘텐츠의 좌우 패딩을 상쇄하는 음수 마진으로 배경을 화면 끝까지 채운다.
  const stickyHeaderStyle = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "0 -20px 24px -20px",
    padding: "22px 20px 14px 20px",
    background: isLight ? "rgba(244,243,238,0.45)" : "rgba(20,20,19,0.45)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
  };

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
          background: ${isLight ? "#F4F3EE" : "#141413"};
        }
      `}</style>

      {/* 전체 화면을 항상 덮는 고정 배경 레이어 */}
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

      {/* 탭 콘텐츠 영역 (상단 헤더만 남기고 본문은 비워둠) */}
      <div
        style={{
          minHeight: vh,
          width: "100%",
          boxSizing: "border-box",
          padding: "0 20px 140px 20px",
        }}
      >
        <div style={stickyHeaderStyle}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: isLight ? "#14161A" : "#FFFFFF",
                letterSpacing: 0.2,
                minHeight: "1em",
              }}
            >
              {TAB_TITLES[active]}
            </h1>
          </div>
        </div>
      </div>

      {/* 하단 컨트롤 영역 */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: 20,
          right: 20,
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
            flexShrink: 0,
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
              background: isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)",
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
                  minWidth: 52,
                  height: BAR_HEIGHT - 16,
                  padding: "0 17px",
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
                  // 홈 탭
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3.2 3 10.5V20a1 1 0 0 0 1 1h5.5v-6.5h5V21H19a1 1 0 0 0 1-1v-9.5L12 3.2z" />
                  </svg>
                ) : (
                  // 아직 기능이 없는 나머지 탭 - 빈 원형 아이콘으로 자리만 채워둔다
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="7.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* 검색 바 (리퀴드 글래스, 탭바와 동일한 높이) - 클라우드플레어 R2 연동 전이라 아직 실제 검색은
            수행하지 않고 입력값만 로컬 상태로 들고 있는다. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: BAR_HEIGHT,
            flex: 1,
            minWidth: 0,
            boxSizing: "border-box",
            padding: "0 16px",
            borderRadius: 999,
            background: isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: `1px solid ${
              searchFocused
                ? (isLight ? "rgba(20,22,26,0.28)" : "rgba(255,255,255,0.28)")
                : (isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)")
            }`,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
            transition: "border 0.2s ease",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="검색"
            aria-label="검색"
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              fontWeight: 500,
              color: isLight ? "#14161A" : "#FFFFFF",
            }}
          />
        </div>
      </div>
    </div>
  );
}
