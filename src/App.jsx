import React, { useState, useRef, useEffect } from "react";

// 앱 버전 표기
const APP_VERSION = "0.2.2";

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

  // 하단 바의 원형 검색 버튼 - 누르면 탭바 위에 같은 디자인의 검색창 패널이 열린다.
  // Cloudflare R2 연동 전이라 아직 실제 검색은 수행하지 않고 입력값만 로컬 상태로 들고 있는다.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchButtonHovered, setSearchButtonHovered] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef(null);

  // 홈 탭 기능: 경로, 폴더, 파일, 업로드 메뉴
  const [currentPath, setCurrentPath] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploadButtonHovered, setUploadButtonHovered] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [uploadMenuVisible, setUploadMenuVisible] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderMenuOpen, setFolderMenuOpen] = useState(null);
  const [folderMenuVisibleId, setFolderMenuVisibleId] = useState(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(null);
  const [fileMenuVisibleId, setFileMenuVisibleId] = useState(null);
  const galleryInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const toggleSearch = () => {
    if (searchOpen) {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      setSearchVisible(false);
      setTimeout(() => {
        setSearchOpen(false);
        setSearchQuery("");
      }, 300);
    } else {
      setSearchOpen(true);
      requestAnimationFrame(() => {
        setSearchVisible(true);
        searchInputRef.current && searchInputRef.current.focus();
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && searchOpen) {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  const navigateToBreadcrumb = (index) => {
    setCurrentPath(currentPath.slice(0, index));
  };

  // 업로드 메뉴 - 부드러운 페이드/슬라이드 애니메이션을 위해 마운트(open)와
  // 실제 트랜지션 시작(visible)을 한 프레임 지연시켜 분리한다.
  const openUploadMenu = () => {
    setUploadMenuOpen(true);
    requestAnimationFrame(() => setUploadMenuVisible(true));
  };
  const closeUploadMenu = () => {
    setUploadMenuVisible(false);
    setTimeout(() => setUploadMenuOpen(false), 200);
  };
  const toggleUploadMenu = () => {
    if (uploadMenuOpen) closeUploadMenu();
    else openUploadMenu();
  };

  const openFolderModal = () => {
    setFolderModalOpen(true);
    requestAnimationFrame(() => setFolderModalVisible(true));
  };
  const closeFolderModal = () => {
    setFolderModalVisible(false);
    setTimeout(() => {
      setFolderModalOpen(false);
      setFolderName("");
    }, 200);
  };

  const openFolderMenu = (id) => {
    setFolderMenuOpen(id);
    requestAnimationFrame(() => setFolderMenuVisibleId(id));
  };
  const closeFolderMenu = () => {
    setFolderMenuVisibleId(null);
    setTimeout(() => setFolderMenuOpen(null), 200);
  };
  const toggleFolderMenu = (id) => {
    if (folderMenuOpen === id) closeFolderMenu();
    else openFolderMenu(id);
  };

  const openFileMenu = (id) => {
    setFileMenuOpen(id);
    requestAnimationFrame(() => setFileMenuVisibleId(id));
  };
  const closeFileMenu = () => {
    setFileMenuVisibleId(null);
    setTimeout(() => setFileMenuOpen(null), 200);
  };
  const toggleFileMenu = (id) => {
    if (fileMenuOpen === id) closeFileMenu();
    else openFileMenu(id);
  };

  const createFolder = () => {
    if (folderName.trim()) {
      const newFolder = {
        id: Date.now(),
        name: folderName,
        path: [...currentPath, folderName],
      };
      setFolders([...folders, newFolder]);
    }
    closeFolderModal();
  };

  const renameFolder = (folderId, newName) => {
    if (newName.trim()) {
      setFolders(folders.map(f => f.id === folderId ? { ...f, name: newName } : f));
    }
    closeFolderMenu();
  };

  const deleteFolder = (folderId) => {
    setFolders(folders.filter(f => f.id !== folderId));
    closeFolderMenu();
  };

  // 실제 갤러리/파일 선택 다이얼로그(input[type=file])를 통해 고른 항목을
  // 현재 위치(currentPath)에 저장 - 아직 Cloudflare R2 연동 전이라 로컬 상태로만 보관
  const handleFilesPicked = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) {
      const newFiles = selected.map((f) => ({
        id: Date.now() + Math.random(),
        name: f.name,
        size: f.size,
        mimeType: f.type,
        path: currentPath,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const renameFile = (fileId, newName) => {
    if (newName.trim()) {
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f)));
    }
    closeFileMenu();
  };

  const deleteFile = (fileId) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    closeFileMenu();
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const getFileIcon = (mimeType) => {
    const color = isLight ? "#14161A" : "#FFFFFF";
    if (mimeType && mimeType.startsWith("image/")) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm3 10 3.2-4 2.4 3 2-2.6L18 15H7z" />
        </svg>
      );
    }
    if (mimeType && mimeType.startsWith("video/")) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
          <path d="M4 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3.5l4-2.2v11.4l-4-2.2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />
        </svg>
      );
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path d="M14 2v5h5" />
      </svg>
    );
  };

  // 버튼을 누르는 순간 살짝 눌리는 듯한 촉감 애니메이션 - 손을 떼거나 커서가
  // 벗어나면 원래 스케일(래스팅 값)로 되돌아온다.
  const pressDown = (restingTransform) => (e) => {
    e.currentTarget.style.transform = "scale(0.92)";
  };
  const pressUp = (restingTransform) => (e) => {
    e.currentTarget.style.transform = restingTransform;
  };

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

      {/* 탭 콘텐츠 영역 */}
      <div
        style={{
          minHeight: vh,
          width: "100%",
          boxSizing: "border-box",
          padding: "0 20px 140px 20px",
        }}
      >
        {/* 상단 헤더 */}
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

        {/* 홈 탭 콘텐츠 */}
        {active === 0 && (
          <>
            {/* 경로 표기 및 업로드 버튼 영역 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 12,
                marginBottom: 16,
                borderBottom: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
              }}
            >
              {/* 경로 표기 */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                <button
                  onClick={() => setCurrentPath([])}
                  onMouseDown={pressDown("scale(0.92)")}
                  onMouseUp={pressUp("scale(1)")}
                  style={{
                    background: "none",
                    border: "none",
                    color: isLight ? "#14161A" : "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    padding: 0,
                    outline: "none",
                    opacity: currentPath.length === 0 ? 1 : 0.7,
                    transition: "opacity 0.2s ease, transform 0.15s ease",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = currentPath.length === 0 ? "1" : "0.7";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  홈
                </button>
                {currentPath.map((path, index) => (
                  <div key={index} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)", fontSize: 14 }}>
                      &gt;
                    </span>
                    <button
                      onClick={() => navigateToBreadcrumb(index)}
                      onMouseDown={pressDown("scale(0.92)")}
                      onMouseUp={pressUp("scale(1)")}
                      style={{
                        background: "none",
                        border: "none",
                        color: isLight ? "#14161A" : "#FFFFFF",
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: "pointer",
                        padding: 0,
                        outline: "none",
                        opacity: 0.7,
                        transition: "opacity 0.2s ease, transform 0.15s ease",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0.7";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      {path}
                    </button>
                  </div>
                ))}
              </div>

              {/* 업로드 버튼 - 리퀴드 글래스 원형, 호버 시 확대 + 누르면 살짝 눌리는 애니메이션 */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={toggleUploadMenu}
                  onMouseEnter={() => setUploadButtonHovered(true)}
                  onMouseLeave={(e) => {
                    setUploadButtonHovered(false);
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                  onMouseDown={pressDown("scale(0.92)")}
                  onMouseUp={pressUp(uploadButtonHovered ? "scale(1.08)" : "scale(1)")}
                  onTouchStart={pressDown("scale(0.92)")}
                  onTouchEnd={pressUp("scale(1)")}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                    background: uploadMenuOpen || uploadButtonHovered
                      ? (isLight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.14)")
                      : (isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.06)"),
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    boxShadow: uploadButtonHovered
                      ? "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                      : "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: isLight ? "#14161A" : "#FFFFFF",
                    outline: "none",
                    transition: "background 0.3s ease, box-shadow 0.3s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                    transform: uploadButtonHovered ? "scale(1.08)" : "scale(1)",
                  }}
                  aria-label="추가하기"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                      transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
                      transform: uploadMenuOpen ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {/* 숨겨진 파일 입력 - 갤러리(이미지/동영상)와 일반 파일을 각각 실제로 선택할 수 있다 */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFilesPicked}
                  style={{ display: "none" }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFilesPicked}
                  style={{ display: "none" }}
                />

                {/* 업로드 메뉴 - 부드러운 페이드 + 슬라이드 애니메이션 */}
                {uploadMenuOpen && (
                  <>
                    <div onClick={closeUploadMenu} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                    <div
                      style={{
                        position: "absolute",
                        top: 40,
                        right: 0,
                        minWidth: 140,
                        background: isLight ? "rgba(244,243,238,0.95)" : "rgba(20,20,19,0.95)",
                        backdropFilter: "blur(20px) saturate(180%)",
                        WebkitBackdropFilter: "blur(20px) saturate(180%)",
                        borderRadius: 12,
                        border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
                        zIndex: 20,
                        overflow: "hidden",
                        transformOrigin: "top right",
                        opacity: uploadMenuVisible ? 1 : 0,
                        transform: uploadMenuVisible ? "scale(1) translateY(0)" : "scale(0.92) translateY(-6px)",
                        transition: "opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          closeUploadMenu();
                          galleryInputRef.current && galleryInputRef.current.click();
                        }}
                        onMouseDown={pressDown("scale(0.97)")}
                        onMouseUp={pressUp("scale(1)")}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "none",
                          background: "transparent",
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: "pointer",
                          outline: "none",
                          textAlign: "left",
                          transition: "background 0.2s, transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.06)"}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        갤러리
                      </button>
                      <button
                        onClick={() => {
                          closeUploadMenu();
                          fileInputRef.current && fileInputRef.current.click();
                        }}
                        onMouseDown={pressDown("scale(0.97)")}
                        onMouseUp={pressUp("scale(1)")}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "none",
                          background: "transparent",
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: "pointer",
                          outline: "none",
                          textAlign: "left",
                          transition: "background 0.2s, transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.06)"}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        파일
                      </button>
                      <div style={{ height: 1, background: isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)" }} />
                      <button
                        onClick={() => {
                          closeUploadMenu();
                          openFolderModal();
                        }}
                        onMouseDown={pressDown("scale(0.97)")}
                        onMouseUp={pressUp("scale(1)")}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "none",
                          background: "transparent",
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: "pointer",
                          outline: "none",
                          textAlign: "left",
                          transition: "background 0.2s, transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.06)"}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        폴더
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 구분선 아래는 전부 드라이브 리스트 공간 - 현재 위치의 폴더와 파일을 함께 보여준다 */}
            {(() => {
              const visibleFolders = folders.filter(
                (f) =>
                  f.path.length === currentPath.length + 1 &&
                  f.path.slice(0, currentPath.length).every((p, i) => p === currentPath[i])
              );
              const visibleFiles = files.filter(
                (f) =>
                  f.path.length === currentPath.length &&
                  f.path.every((p, i) => p === currentPath[i])
              );

              if (visibleFolders.length === 0 && visibleFiles.length === 0) {
                return (
                  <div
                    style={{
                      padding: "48px 0",
                      textAlign: "center",
                      color: isLight ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.35)",
                      fontSize: 13,
                    }}
                  >
                    비어 있습니다
                  </div>
                );
              }

              return (
                <>
                  {visibleFolders.map((folder) => (
                    <div
                      key={folder.id}
                      onClick={() => setCurrentPath([...currentPath, folder.name])}
                      onMouseDown={pressDown("scale(0.98)")}
                      onMouseUp={pressUp("scale(1)")}
                      onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)"}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isLight ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.04)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        marginBottom: 8,
                        borderRadius: 10,
                        background: isLight ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.04)",
                        backdropFilter: "blur(20px) saturate(180%)",
                        WebkitBackdropFilter: "blur(20px) saturate(180%)",
                        border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
                        cursor: "pointer",
                        transition: "background 0.2s ease, transform 0.15s ease",
                      }}
                    >
                      {/* 폴더 아이콘 */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill={isLight ? "#14161A" : "#FFFFFF"} style={{ flexShrink: 0 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>

                      {/* 폴더 이름 */}
                      <div
                        style={{
                          flex: 1,
                          color: isLight ? "#14161A" : "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {folder.name}
                      </div>

                      {/* 삼점 메뉴 */}
                      <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleFolderMenu(folder.id)}
                          onMouseDown={pressDown("scale(0.85)")}
                          onMouseUp={pressUp("scale(1)")}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: "none",
                            background: "transparent",
                            color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                            cursor: "pointer",
                            outline: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.08)";
                            e.currentTarget.style.color = isLight ? "#14161A" : "#FFFFFF";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)";
                          }}
                          aria-label="옵션"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>

                        {/* 폴더 메뉴 */}
                        {folderMenuOpen === folder.id && (
                          <>
                            <div onClick={closeFolderMenu} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
                            <div
                              style={{
                                position: "absolute",
                                top: 32,
                                right: 0,
                                minWidth: 120,
                                background: isLight ? "rgba(244,243,238,0.95)" : "rgba(20,20,19,0.95)",
                                backdropFilter: "blur(20px) saturate(180%)",
                                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                                borderRadius: 12,
                                border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                                boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
                                zIndex: 30,
                                overflow: "hidden",
                                transformOrigin: "top right",
                                opacity: folderMenuVisibleId === folder.id ? 1 : 0,
                                transform: folderMenuVisibleId === folder.id ? "scale(1) translateY(0)" : "scale(0.92) translateY(-6px)",
                                transition: "opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  const newName = prompt("새 이름:", folder.name);
                                  if (newName) renameFolder(folder.id, newName);
                                  else closeFolderMenu();
                                }}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  border: "none",
                                  background: "transparent",
                                  color: isLight ? "#14161A" : "#FFFFFF",
                                  fontSize: 14,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  outline: "none",
                                  textAlign: "left",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.06)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                이름 수정
                              </button>
                              <div style={{ height: 1, background: isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)" }} />
                              <button
                                onClick={() => deleteFolder(folder.id)}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  border: "none",
                                  background: "transparent",
                                  color: "#EF4444",
                                  fontSize: 14,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  outline: "none",
                                  textAlign: "left",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.1)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                삭제
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {visibleFiles.map((file) => (
                    <div
                      key={file.id}
                      onMouseDown={pressDown("scale(0.98)")}
                      onMouseUp={pressUp("scale(1)")}
                      onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)"}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isLight ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.04)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        marginBottom: 8,
                        borderRadius: 10,
                        background: isLight ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.04)",
                        backdropFilter: "blur(20px) saturate(180%)",
                        WebkitBackdropFilter: "blur(20px) saturate(180%)",
                        border: `1px solid ${isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)"}`,
                        transition: "background 0.2s ease, transform 0.15s ease",
                      }}
                    >
                      <div style={{ flexShrink: 0 }}>{getFileIcon(file.mimeType)}</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: isLight ? "#14161A" : "#FFFFFF",
                            fontSize: 14,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {file.name}
                        </div>
                        <div style={{ color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
                          {formatFileSize(file.size)}
                        </div>
                      </div>

                      {/* 삼점 메뉴 */}
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => toggleFileMenu(file.id)}
                          onMouseDown={pressDown("scale(0.85)")}
                          onMouseUp={pressUp("scale(1)")}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: "none",
                            background: "transparent",
                            color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)",
                            cursor: "pointer",
                            outline: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.08)";
                            e.currentTarget.style.color = isLight ? "#14161A" : "#FFFFFF";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)";
                          }}
                          aria-label="옵션"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>

                        {fileMenuOpen === file.id && (
                          <>
                            <div onClick={closeFileMenu} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
                            <div
                              style={{
                                position: "absolute",
                                top: 32,
                                right: 0,
                                minWidth: 120,
                                background: isLight ? "rgba(244,243,238,0.95)" : "rgba(20,20,19,0.95)",
                                backdropFilter: "blur(20px) saturate(180%)",
                                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                                borderRadius: 12,
                                border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                                boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
                                zIndex: 30,
                                overflow: "hidden",
                                transformOrigin: "top right",
                                opacity: fileMenuVisibleId === file.id ? 1 : 0,
                                transform: fileMenuVisibleId === file.id ? "scale(1) translateY(0)" : "scale(0.92) translateY(-6px)",
                                transition: "opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  const newName = prompt("새 이름:", file.name);
                                  if (newName) renameFile(file.id, newName);
                                  else closeFileMenu();
                                }}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  border: "none",
                                  background: "transparent",
                                  color: isLight ? "#14161A" : "#FFFFFF",
                                  fontSize: 14,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  outline: "none",
                                  textAlign: "left",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(20,22,26,0.06)" : "rgba(255,255,255,0.06)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                이름 수정
                              </button>
                              <div style={{ height: 1, background: isLight ? "rgba(20,22,26,0.12)" : "rgba(255,255,255,0.12)" }} />
                              <button
                                onClick={() => deleteFile(file.id)}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  border: "none",
                                  background: "transparent",
                                  color: "#EF4444",
                                  fontSize: 14,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  outline: "none",
                                  textAlign: "left",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.1)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                삭제
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* 폴더 생성 모달 - 배경 페이드 + 카드 스케일 인/아웃 애니메이션 */}
      {folderModalOpen && (
        <>
          <div
            onClick={closeFolderModal}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 39,
              opacity: folderModalVisible ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: folderModalVisible ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.92)",
              opacity: folderModalVisible ? 1 : 0,
              background: isLight ? "#F4F3EE" : "#1a1918",
              borderRadius: 16,
              border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
              padding: 24,
              minWidth: 280,
              zIndex: 40,
              boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
              transition: "opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                margin: "0 0 16px 0",
                fontSize: 18,
                fontWeight: 700,
                color: isLight ? "#14161A" : "#FFFFFF",
              }}
            >
              폴더 만들기
            </h2>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="폴더 이름"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
                if (e.key === "Escape") closeFolderModal();
              }}
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 20,
                border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                borderRadius: 8,
                background: isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.06)",
                color: isLight ? "#14161A" : "#FFFFFF",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s ease",
              }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={closeFolderModal}
                onMouseDown={pressDown("scale(0.95)")}
                onMouseUp={pressUp("scale(1)")}
                style={{
                  flex: 1,
                  padding: 10,
                  border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
                  borderRadius: 8,
                  background: isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.06)",
                  color: isLight ? "#14161A" : "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                  transition: "background 0.2s ease, transform 0.15s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.06)";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                취소
              </button>
              <button
                onClick={createFolder}
                onMouseDown={pressDown("scale(0.95)")}
                onMouseUp={pressUp("scale(1)")}
                style={{
                  flex: 1,
                  padding: 10,
                  border: "none",
                  borderRadius: 8,
                  background: isLight ? "#14161A" : "#FFFFFF",
                  color: isLight ? "#FFFFFF" : "#14161A",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
              >
                확인
              </button>
            </div>
          </div>
        </>
      )}

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
                onMouseLeave={(e) => {
                  setHovered(null);
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = "translateY(0) scale(0.93)"}
                onMouseUp={pressUp(isHovered && !isActive ? "translateY(-1px) scale(1)" : "translateY(0) scale(1)")}
                onTouchStart={(e) => e.currentTarget.style.transform = "translateY(0) scale(0.93)"}
                onTouchEnd={pressUp("translateY(0) scale(1)")}
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
                    "color 0.3s ease, background 0.3s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                  transform: isHovered && !isActive ? "translateY(-1px) scale(1)" : "translateY(0) scale(1)",
                  outline: "none",
                }}
              >
                {i === 0 ? (
                  // 홈 탭
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3.2 3 10.5V20a1 1 0 0 0 1 1h5.5v-6.5h5V21H19a1 1 0 0 0 1-1v-9.5L12 3.2z" />
                  </svg>
                ) : i === 1 ? (
                  // 커뮤니티 탭
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.4 3.7A0.6 0.6 0 0 1 3.6 20V6a1 1 0 0 1 1-1z" />
                  </svg>
                ) : (
                  // 설정 탭
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="8" r="3.6" />
                    <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1z" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* 검색 버튼 (리퀴드 글래스, 탭바와 동일한 높이의 원형) - 누르면 탭바 위에 검색창 패널이 열린다 */}
        <button
          onClick={toggleSearch}
          onMouseEnter={() => setSearchButtonHovered(true)}
          onMouseLeave={(e) => {
            setSearchButtonHovered(false);
            e.currentTarget.style.transform = "scale(1)";
          }}
          onMouseDown={pressDown("scale(0.9)")}
          onMouseUp={pressUp(searchButtonHovered ? "scale(1.08)" : "scale(1)")}
          onTouchStart={pressDown("scale(0.9)")}
          onTouchEnd={pressUp("scale(1)")}
          aria-label="검색창 열기"
          style={{
            width: BAR_HEIGHT,
            height: BAR_HEIGHT,
            flexShrink: 0,
            borderRadius: "50%",
            border: `1px solid ${isLight ? "rgba(20,22,26,0.14)" : "rgba(255,255,255,0.14)"}`,
            background: searchButtonHovered
              ? (isLight ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.14)")
              : (isLight ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.06)"),
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            boxShadow: searchButtonHovered
              ? "0 10px 36px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)"
              : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
            color: isLight ? "#14161A" : "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            outline: "none",
            transition:
              "background 0.3s ease, box-shadow 0.3s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
            transform: searchButtonHovered ? "scale(1.08)" : "scale(1)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </div>

      {/* 검색창 패널 (리퀴드 글래스) - 탭바와 동일한 디자인 위에 검색 플레이스홀더 입력창 하나만 있다.
          입력창 폰트 크기를 16px 이상으로 둬야 iOS 사파리가 포커스 시 화면을 자동 확대하지 않는다. */}
      {searchOpen && (
        <>
          <div onClick={toggleSearch} style={{ position: "fixed", inset: 0, zIndex: 9 }} />
          <div
            style={{
              position: "fixed",
              bottom: 24 + BAR_HEIGHT + 14,
              left: "50%",
              zIndex: 10,
              width: "min(360px, 88vw)",
              opacity: searchVisible ? 1 : 0,
              transform: searchVisible
                ? "translate(-50%, 0)"
                : "translate(-50%, 16px)",
              transition:
                "opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: isLight ? "rgba(20,22,26,0.45)" : "rgba(255,255,255,0.45)", flexShrink: 0, marginLeft: 4 }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색"
                aria-label="검색"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 16,
                  fontWeight: 500,
                  color: isLight ? "#14161A" : "#FFFFFF",
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
