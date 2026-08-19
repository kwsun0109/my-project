import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 마커 아이콘 기본 설정
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  return calculateDistance(lat1, lon1, lat2, lon2) * 1000;
}

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], map.getZoom());
    }
  }, [center, map]);
  return null;
}

function App() {
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 });
  const [path, setPath] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [altitude, setAltitude] = useState(null);
  const [totalDistance, setTotalDistance] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // 패널 열림/닫힘 상태
  const [isOpen, setIsOpen] = useState(true);

  // 저장된 기록 목록 (히스토리)
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("my_history");
    return saved ? JSON.parse(saved) : [];
  });

  // 저장할 때 입력할 제목/메모 상태
  const [recordTitle, setRecordTitle] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  // 경로 변경 시 총 거리 계산
  useEffect(() => {
    let dist = 0;
    for (let i = 0; i < path.length - 1; i++) {
      dist += calculateDistance(
        path[i][0],
        path[i][1],
        path[i + 1][0],
        path[i + 1][1],
      );
    }
    setTotalDistance(dist);
  }, [path]);

  // 히스토리 저장
  useEffect(() => {
    localStorage.setItem("my_history", JSON.stringify(history));
  }, [history]);

  // 시간 흐름 타이머
  useEffect(() => {
    let timer;
    if (isTracking) {
      const startTime = Date.now() - elapsedTime * 1000;
      timer = setInterval(() => {
        const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(currentElapsed);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTracking]);

  // GPS 실시간 추적 시작
  const startTracking = () => {
    if (!navigator.geolocation) {
      setErrorMsg("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }

    setIsTracking(true);
    setErrorMsg("");

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const alt = position.coords.altitude;

        setCenter({ lat, lng });

        if (alt !== null && !isNaN(alt)) {
          setAltitude(alt);
        }

        setPath((prevPath) => {
          if (prevPath.length === 0) {
            return [[lat, lng]];
          }
          const lastPoint = prevPath[prevPath.length - 1];
          const distMeters = calculateDistanceMeters(
            lastPoint[0],
            lastPoint[1],
            lat,
            lng,
          );

          if (distMeters >= 3) {
            return [...prevPath, [lat, lng]];
          }
          return prevPath;
        });
      },
      (error) => {
        console.error(error);
        setErrorMsg("위치 정보를 가져올 수 없습니다. 권한을 확인해주세요.");
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  const pauseTracking = () => {
    setIsTracking(false);
  };

  // 전체 초기화 (저장하지 않고 지우기)
  const handleClearPath = () => {
    if (path.length > 0 && !window.confirm("정말 현재 기록을 지우시겠습니까?"))
      return;
    setPath([]);
    setAltitude(null);
    setTotalDistance(0);
    setElapsedTime(0);
    setIsTracking(false);
    setShowSaveInput(false);
    setRecordTitle("");
  };

  // 💾 원할 때만 기록 저장하기
  const handleSaveRecord = () => {
    if (path.length === 0) {
      alert("저장할 경로 데이터가 없습니다.");
      return;
    }

    const newRecord = {
      id: Date.now(),
      title:
        recordTitle.trim() || `내 발자취 (${new Date().toLocaleDateString()})`,
      date: new Date().toLocaleString(),
      path,
      totalDistance,
      elapsedTime,
      altitude,
    };

    setHistory([newRecord, ...history]);
    alert("성공적으로 저장되었습니다!");
    setShowSaveInput(false);
    setRecordTitle("");
  };

  // 저장된 기록 불러오기
  const loadRecord = (record) => {
    if (isTracking) {
      alert("추적 중에는 기록을 불러올 수 없습니다. 일시정지 후 시도해주세요.");
      return;
    }
    setPath(record.path);
    setTotalDistance(record.totalDistance);
    setElapsedTime(record.elapsedTime);
    setAltitude(record.altitude);
    if (record.path.length > 0) {
      setCenter({ lat: record.path[0][0], lng: record.path[0][1] });
    }
  };

  // 저장된 개별 기록 삭제
  const deleteHistoryItem = (id, e) => {
    e.stopPropagation(); // 목록 클릭 이벤트 전파 방지
    if (window.confirm("이 저장 기록을 삭제하시겠습니까?")) {
      setHistory(history.filter((item) => item.id !== id));
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}시간 ${mins}분 ${secs}초`;
    }
    return `${mins}분 ${secs}초`;
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        fontFamily: "sans-serif",
      }}
    >
      {/* 조작 및 정보 패널 */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          background: "white",
          padding: "10px 15px",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
          textAlign: "center",
          width: "90%",
          maxWidth: "380px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: "100%",
            padding: "6px",
            fontSize: "13px",
            backgroundColor: "#e0e0e0",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontWeight: "bold",
            marginBottom: isOpen ? "8px" : "0",
          }}
        >
          {isOpen ? "▲ 내 발자취 숨기기" : "▼ 내 발자취 열기"}
        </button>

        {isOpen && (
          <>
            <h3 style={{ margin: "0 0 5px 0" }}>내 발자취</h3>
            <p style={{ fontSize: "11px", color: "#555", margin: "0 0 6px 0" }}>
              위치·고도·거리·시간 측정 및 선택적 저장 기능
            </p>

            {errorMsg && (
              <p style={{ fontSize: "12px", color: "red", margin: "5px 0" }}>
                {errorMsg}
              </p>
            )}

            <div
              style={{
                background: "#f8f9fa",
                padding: "8px",
                borderRadius: "6px",
                margin: "6px 0",
                fontSize: "13px",
                textAlign: "left",
              }}
            >
              <div>
                📍 상태: <b>{isTracking ? "추적 중..." : "대기 중"}</b>
              </div>
              <div>
                📏 총 이동 거리:{" "}
                <b style={{ color: "#2196F3" }}>
                  {totalDistance.toFixed(2)} km
                </b>
              </div>
              <div>
                ⏱️ 소요 시간: <b>{formatTime(elapsedTime)}</b>
              </div>
              <div>
                ⛰️ 현재 고도:{" "}
                <span style={{ color: "#4CAF50" }}>
                  {altitude !== null ? `${altitude.toFixed(1)} m` : "대기 중"}
                </span>
              </div>
              <div>
                📌 총 포인트: <b>{path.length}개</b>
              </div>
            </div>

            {/* 버튼 그룹 */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "center",
                marginTop: "8px",
              }}
            >
              {!isTracking ? (
                <button
                  onClick={startTracking}
                  style={{
                    flex: 1,
                    padding: "8px",
                    fontSize: "14px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  추적 시작
                </button>
              ) : (
                <button
                  onClick={pauseTracking}
                  style={{
                    flex: 1,
                    padding: "8px",
                    fontSize: "14px",
                    backgroundColor: "#ff9800",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  일시정지
                </button>
              )}

              <button
                onClick={handleClearPath}
                style={{
                  padding: "8px 12px",
                  fontSize: "14px",
                  backgroundColor: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                }}
              >
                초기화
              </button>
            </div>

            {/* 원할 때만 누르는 '기록 저장' 영역 */}
            {path.length > 0 && !showSaveInput && (
              <button
                onClick={() => setShowSaveInput(true)}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "8px",
                  fontSize: "14px",
                  backgroundColor: "#2196F3",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                }}
              >
                💾 이 기록 저장하기
              </button>
            )}

            {/* 저장 제목 입력 폼 */}
            {showSaveInput && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "8px",
                  background: "#e3f2fd",
                  borderRadius: "6px",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "bold",
                    marginBottom: "4px",
                  }}
                >
                  기록 이름(제목) 입력
                </div>
                <input
                  type="text"
                  placeholder="예: 오늘 저녁 산책 코스"
                  value={recordTitle}
                  onChange={(e) => setRecordTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px",
                    boxSizing: "border-box",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    marginBottom: "6px",
                  }}
                />
                <div style={{ display: "flex", gap: "5px" }}>
                  <button
                    onClick={handleSaveRecord}
                    style={{
                      flex: 1,
                      padding: "6px",
                      background: "#2196F3",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    저장 확인
                  </button>
                  <button
                    onClick={() => setShowSaveInput(false)}
                    style={{
                      padding: "6px 10px",
                      background: "#9e9e9e",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            {/* 저장된 발자취 히스토리 목록 */}
            <div
              style={{
                marginTop: "15px",
                borderTop: "1px solid #ddd",
                paddingTop: "10px",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "bold",
                  marginBottom: "6px",
                }}
              >
                📂 저장된 발자취 목록 ({history.length})
              </div>
              {history.length === 0 ? (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#888",
                    textAlign: "center",
                    padding: "10px",
                  }}
                >
                  저장된 기록이 없습니다.
                </div>
              ) : (
                <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => loadRecord(item)}
                      style={{
                        padding: "8px",
                        marginBottom: "5px",
                        background: "#f1f3f5",
                        borderRadius: "5px",
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "bold", color: "#333" }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: "10px", color: "#666" }}>
                          {item.totalDistance.toFixed(2)} km |{" "}
                          {formatTime(item.elapsedTime)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f44336",
                          cursor: "pointer",
                          fontSize: "12px",
                          padding: "4px",
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 지도 영역 */}
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <MapRecenter center={center} />

        <Polyline positions={path} color="#2196F3" weight={5} opacity={0.8} />

        {path.length > 0 && (
          <Marker position={path[0]}>
            <Popup>
              <div>
                <b>출발지</b>
                <br />
                <span style={{ fontSize: "11px", color: "#666" }}>
                  {path[0][0].toFixed(4)}, {path[0][1].toFixed(4)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {path.length > 0 && (
          <Marker position={path[path.length - 1]}>
            <Popup>
              <div>
                <b>현재 위치</b>
                <br />
                <span style={{ fontSize: "11px", color: "#666" }}>
                  {path[path.length - 1][0].toFixed(4)},{" "}
                  {path[path.length - 1][1].toFixed(4)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default App;
