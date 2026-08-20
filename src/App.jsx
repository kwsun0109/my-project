import React, { useState, useEffect, useRef } from "react";
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

// 리프렛 기본 마커 이미지 경로 설정 오류 방지
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// 두 지점 간의 위도/경도를 이용해 직선 거리(km)를 구하는 함수 (하버사인 공식)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 지구의 반지름 (km)
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

// 거리(km)를 미터(m) 단위로 변환해 주는 함수
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  return calculateDistance(lat1, lon1, lat2, lon2) * 1000;
}

// 위치가 바뀔 때마다 지도의 중심을 현재 위치로 부드럽게 이동시켜 주는 컴포넌트
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
  // 지도의 중심 좌표 상태
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 });
  
  // 이동 경로 좌표 배열 (새로고침해도 로컬스토리지에서 유지)
  const [path, setPath] = useState(() => {
    const saved = localStorage.getItem('my_path');
    return saved ? JSON.parse(saved) : [];
  });

  // 추적 중인지 여부 상태 (새로고침 시 유지)
  const [isTracking, setIsTracking] = useState(() => {
    return localStorage.getItem('is_tracking') === 'true';
  });
  const [errorMsg, setErrorMsg] = useState("");
  
  // 현재 고도 상태
  const [altitude, setAltitude] = useState(() => {
    const saved = localStorage.getItem('my_altitude');
    return saved ? parseFloat(saved) : null;
  });

  // 최고 고도 상태 추가
  const [maxAltitude, setMaxAltitude] = useState(() => {
    const saved = localStorage.getItem('my_max_altitude');
    return saved ? parseFloat(saved) : null;
  });

  // 최저 고도 상태 추가
  const [minAltitude, setMinAltitude] = useState(() => {
    const saved = localStorage.getItem('my_min_altitude');
    return saved ? parseFloat(saved) : null;
  });

  const [totalDistance, setTotalDistance] = useState(0);
  const [isOpen, setIsOpen] = useState(true);

  // [핵심] 슬립모드 방어(WakeLock) 객체와 GPS 감시 ID를 담아두는 Ref
  const wakeLockRef = useRef(null);
  const watchIdRef = useRef(null);
  
  // 마지막으로 유효했던 좌표와 측정 시간을 기록하는 Ref (속도 및 휐 방어용)
  const lastValidPositionRef = useRef(null);

  // 소요 시간 상태
  const [elapsedTime, setElapsedTime] = useState(() => {
    const savedElapsed = localStorage.getItem('my_elapsed_time');
    const savedStartTime = localStorage.getItem('my_start_time');
    const savedIsTracking = localStorage.getItem('is_tracking') === 'true';

    if (savedIsTracking && savedStartTime) {
      const extraTime = Math.floor((Date.now() - parseInt(savedStartTime, 10)) / 1000);
      return (savedElapsed ? parseInt(savedElapsed, 10) : 0) + extraTime;
    }
    return savedElapsed ? parseInt(savedElapsed, 10) : 0;
  });

  // 저장된 히스토리 목록 상태
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("my_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [recordTitle, setRecordTitle] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  // 경로가 바뀔 때마다 총 거리 계산 및 로컬 스토리지 저장
  useEffect(() => {
    localStorage.setItem('my_path', JSON.stringify(path));
    let dist = 0;
    for (let i = 0; i < path.length - 1; i++) {
      dist += calculateDistance(
        path[i][0],
        path[i][1],
        path[i + 1][0],
        path[i + 1][1]
      );
    }
    setTotalDistance(dist);
  }, [path]);

  useEffect(() => {
    if (altitude !== null) {
      localStorage.setItem('my_altitude', altitude);
    }
    if (maxAltitude !== null) {
      localStorage.setItem('my_max_altitude', maxAltitude);
    }
    if (minAltitude !== null) {
      localStorage.setItem('my_min_altitude', minAltitude);
    }
  }, [altitude, maxAltitude, minAltitude]);

  useEffect(() => {
    localStorage.setItem("my_history", JSON.stringify(history));
  }, [history]);

  // 1초마다 소요 시간을 늘려주는 타이머 로직
  useEffect(() => {
    let timer;
    if (isTracking) {
      const trackingStartRealTime = Date.now();
      const baseElapsedTime = elapsedTime;

      timer = setInterval(() => {
        const currentElapsed = baseElapsedTime + Math.floor((Date.now() - trackingStartRealTime) / 1000);
        setElapsedTime(currentElapsed);
        localStorage.setItem('my_elapsed_time', currentElapsed);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTracking]);

  // 슬립모드 방어(WakeLock) API 요청 함수
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.error(`WakeLock 오류: ${err.name}, ${err.message}`);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error(`WakeLock 해제 오류: ${err.message}`);
      }
    }
  };

  // 백그라운드 복귀 시 방어막 복구 및 동기화
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isTracking) {
        await requestWakeLock();
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setCenter({ lat, lng });
          },
          (err) => console.log(err),
          { enableHighAccuracy: true }
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTracking]);

  // GPS 추적 시작 함수
  const startTracking = async () => {
    if (!navigator.geolocation) {
      setErrorMsg("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }

    await requestWakeLock();

    const now = Date.now();
    setIsTracking(true);
    localStorage.setItem('is_tracking', 'true');
    localStorage.setItem('my_start_time', now.toString());
    setErrorMsg("");

    // 실시간 위치 감시 시작
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const alt = position.coords.altitude;
        const accuracy = position.coords.accuracy; // GPS 오차 범위 (미터)
        const timestamp = position.timestamp || Date.now();

        // [방어 필터 1] 오차 범위(accuracy)가 50미터 이상으로 신뢰할 수 없으면 버림
        if (accuracy > 50) {
          console.log(`⚠️ 오차가 너무 커서 무시됨: ${accuracy}m`);
          return;
        }

        setCenter({ lat, lng });

        if (alt !== null && !isNaN(alt)) {
          setAltitude(alt);
          // 최고 고도 및 최저 고도 갱신 로직
          setMaxAltitude((prevMax) => (prevMax === null || alt > prevMax ? alt : prevMax));
          setMinAltitude((prevMin) => (prevMin === null || alt < prevMin ? alt : prevMin));
        }

        setPath((prevPath) => {
          if (prevPath.length === 0) {
            lastValidPositionRef.current = { lat, lng, time: timestamp };
            return [[lat, lng]];
          }

          const lastPoint = prevPath[prevPath.length - 1];
          const distMeters = calculateDistanceMeters(
            lastPoint[0],
            lastPoint[1],
            lat,
            lng
          );

          // 너무 가까운 떨림(3미터 미만)은 무시
          if (distMeters < 3) {
            return prevPath;
          }

          // [방어 필터 2] 속도/점프 검증 (비정상적으로 튄 좌표 차단)
          if (lastValidPositionRef.current) {
            const timeDiffSec = (timestamp - lastValidPositionRef.current.time) / 1000;
            if (timeDiffSec > 0) {
              const speedMps = distMeters / timeDiffSec; // 초당 이동 미터
              if (speedMps > 40) {
                console.log(`🚀 이상 좌표 휐 현상 감지 및 차단 (속도: ${speedMps.toFixed(1)} m/s)`);
                return prevPath;
              }
            }
          }

          // 최종 유효성 통과 시 현재 위치를 새로운 기준으로 업데이트하고 경로에 추가
          lastValidPositionRef.current = { lat, lng, time: timestamp };
          return [...prevPath, [lat, lng]];
        });
      },
      (error) => {
        console.error(error);
        setErrorMsg("위치 정보를 가져올 수 없습니다. 권한을 확인해주세요.");
        setIsTracking(false);
        localStorage.setItem('is_tracking', 'false');
        releaseWakeLock();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  };

  // 추적 일시정지 함수
  const pauseTracking = () => {
    setIsTracking(false);
    localStorage.setItem('is_tracking', 'false');
    localStorage.setItem('my_elapsed_time', elapsedTime.toString());
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();
  };

  // 전체 기록 및 로컬스토리지 초기화 함수
  const handleClearPath = () => {
    if (path.length > 0 && !window.confirm("정말 현재 기록을 지우시겠습니까?"))
      return;
    
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setPath([]);
    setAltitude(null);
    setMaxAltitude(null);
    setMinAltitude(null);
    setTotalDistance(0);
    setElapsedTime(0);
    setIsTracking(false);
    lastValidPositionRef.current = null;
    releaseWakeLock();
    setShowSaveInput(false);
    setRecordTitle("");

    localStorage.removeItem('my_path');
    localStorage.removeItem('is_tracking');
    localStorage.removeItem('my_start_time');
    localStorage.removeItem('my_elapsed_time');
    localStorage.removeItem('my_altitude');
    localStorage.removeItem('my_max_altitude');
    localStorage.removeItem('my_min_altitude');
  };

  // 현재 경로 기록을 히스토리에 저장하는 함수
  const handleSaveRecord = () => {
    if (path.length === 0) {
      alert("저장할 경로 데이터가 없습니다.");
      return;
    }

    const newRecord = {
      id: Date.now(),
      title: recordTitle.trim() || `내 발자취 (${new Date().toLocaleDateString()})`,
      date: new Date().toLocaleString(),
      path,
      totalDistance,
      elapsedTime,
      altitude,
      maxAltitude,
      minAltitude,
    };

    setHistory([newRecord, ...history]);
    alert("성공적으로 저장되었습니다!");
    setShowSaveInput(false);
    setRecordTitle("");
  };

  // 저장된 과거 기록을 지도에 불러오는 함수
  const loadRecord = (record) => {
    if (isTracking) {
      alert("추적 중에는 기록을 불러올 수 없습니다. 일시정지 후 시도해주세요.");
      return;
    }
    setPath(record.path);
    setTotalDistance(record.totalDistance);
    setElapsedTime(record.elapsedTime);
    setAltitude(record.altitude !== undefined ? record.altitude : null);
    setMaxAltitude(record.maxAltitude !== undefined ? record.maxAltitude : null);
    setMinAltitude(record.minAltitude !== undefined ? record.minAltitude : null);
    if (record.path.length > 0) {
      setCenter({ lat: record.path[0][0], lng: record.path[0][1] });
    }
  };

  // 개별 히스토리 삭제 함수
  const deleteHistoryItem = (id, e) => {
    e.stopPropagation();
    if (window.confirm("이 저장 기록을 삭제하시겠습니까?")) {
      setHistory(history.filter((item) => item.id !== id));
    }
  };

  // 초 단위를 보기 편한 시/분/초 형식으로 변환하는 함수
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
    <div style={{ width: "100vw", height: "100vh", position: "relative", fontFamily: "sans-serif" }}>
      {/* 상단 UI 컨트롤 패널 */}
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
              이상 좌표 휐 방지 필터 적용됨
            </p>

            {errorMsg && (
              <p style={{ fontSize: "12px", color: "red", margin: "5px 0" }}>
                {errorMsg}
              </p>
            )}

            {/* 현재 상태 정보 출력 박스 */}
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
                📍 상태: <b>{isTracking ? "추적 중 (필터 활성)" : "대기 중"}</b>
              </div>
              <div>
                📏 총 이동 거리: <b style={{ color: "#2196F3" }}>{totalDistance.toFixed(2)} km</b>
              </div>
              <div>
                ⏱️ 소요 시간: <b>{formatTime(elapsedTime)}</b>
              </div>
              <div>
                ⛰️ 현재 고도: <span style={{ color: "#4CAF50" }}>{altitude !== null ? `${altitude.toFixed(1)} m` : "대기 중"}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#666", paddingLeft: "15px", marginTop: "2px" }}>
                - 최고: <span style={{ color: "#e91e63", fontWeight: "bold" }}>{maxAltitude !== null ? `${maxAltitude.toFixed(1)} m` : "-"}</span> / 
                최저: <span style={{ color: "#3f51b5", fontWeight: "bold" }}>{minAltitude !== null ? `${minAltitude.toFixed(1)} m` : "-"}</span>
              </div>
              <div>
                📌 총 포인트: <b>{path.length}개</b>
              </div>
            </div>

            {/* 시작 / 일시정지 / 초기화 버튼 그룹 */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "8px" }}>
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

            {/* 기록 저장 버튼 */}
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

            {/* 기록 이름 입력 폼 */}
            {showSaveInput && (
              <div style={{ marginTop: "10px", padding: "8px", background: "#e3f2fd", borderRadius: "6px", textAlign: "left" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>
                  기록 이름(제목) 입력
                </div>
                <input
                  type="text"
                  placeholder="예: 아침 출근길 코스"
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
                      background: "gray",
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

            {/* 저장된 발자취 목록 영역 */}
            <div style={{ marginTop: "15px", borderTop: "1px solid #ddd", paddingTop: "10px", textAlign: "left" }}>
              <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "6px" }}>
                📂 저장된 발자취 목록 ({history.length})
              </div>
              {history.length === 0 ? (
                <div style={{ fontSize: "11px", color: "#888", textAlign: "center", padding: "10px" }}>
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
                        <div style={{ fontWeight: "bold", color: "#333" }}>{item.title}</div>
                        <div style={{ fontSize: "10px", color: "#666" }}>
                          {item.totalDistance.toFixed(2)} km | {formatTime(item.elapsedTime)}
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

      {/* 지도 및 경로 렌더링 영역 */}
      <MapContainer center={[center.lat, center.lng]} zoom={16} style={{ width: "100%", height: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapRecenter center={center} />
        {/* 이동한 선을 그려주는 컴포넌트 */}
        <Polyline positions={path} color="#2196F3" weight={5} opacity={0.8} />

        {path.length > 0 && (
          <Marker position={path[0]}>
            <Popup>출발지</Popup>
          </Marker>
        )}
        {path.length > 0 && (
          <Marker position={path[path.length - 1]}>
            <Popup>현재 위치</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default App;