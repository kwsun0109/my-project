import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// 마커 아이콘 기본 설정
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// 두 지점 간의 거리(km)를 계산하는 공식 (Haversine Formula)
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
  return R * c; // km 단위
}

// 미터(m) 단위로 두 지점 간의 거리 계산
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  return calculateDistance(lat1, lon1, lat2, lon2) * 1000;
}

// 실시간 내 위치로 지도를 이동시켜 주는 컴포넌트
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
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.9780 });
  const [path, setPath] = useState(() => {
    const saved = localStorage.getItem('my_path');
    return saved ? JSON.parse(saved) : [];
  });
  const [memos, setMemos] = useState(() => {
    const saved = localStorage.getItem('my_memos');
    return saved ? JSON.parse(saved) : {};
  });

  const [isTracking, setIsTracking] = useState(() => {
    return localStorage.getItem('is_tracking') === 'true';
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [altitude, setAltitude] = useState(() => {
    const saved = localStorage.getItem('my_altitude');
    return saved ? parseFloat(saved) : null;
  });
  
  const [totalDistance, setTotalDistance] = useState(0);

  // 패널 열림/닫힘 상태
  const [isOpen, setIsOpen] = useState(true);

  // ⏱️ 시간 측정 상태
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

  // 경로 변경 시 로컬 스토리지 저장 및 총 거리 계산
  useEffect(() => {
    localStorage.setItem('my_path', JSON.stringify(path));
    
    let dist = 0;
    for (let i = 0; i < path.length - 1; i++) {
      dist += calculateDistance(path[i][0], path[i][1], path[i+1][0], path[i+1][1]);
    }
    setTotalDistance(dist);
  }, [path]);

  useEffect(() => {
    localStorage.setItem('my_memos', JSON.stringify(memos));
  }, [memos]);

  useEffect(() => {
    if (altitude !== null) {
      localStorage.setItem('my_altitude', altitude);
    }
  }, [altitude]);

  // ⏱️ 시간 흐름 타이머
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

  // GPS 실시간 추적 시작
  const startTracking = () => {
    if (!navigator.geolocation) {
      setErrorMsg('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }

    const now = Date.now();
    setIsTracking(true);
    localStorage.setItem('is_tracking', 'true');
    localStorage.setItem('my_start_time', now.toString());
    setErrorMsg('');

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
          const distMeters = calculateDistanceMeters(lastPoint[0], lastPoint[1], lat, lng);
          
          if (distMeters >= 3) {
            return [...prevPath, [lat, lng]];
          }
          return prevPath;
        });
      },
      (error) => {
        console.error(error);
        setErrorMsg('위치 정보를 가져올 수 없습니다. 권한을 확인해주세요.');
        setIsTracking(false);
        localStorage.setItem('is_tracking', 'false');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  // 일시정지 버튼
  const pauseTracking = () => {
    setIsTracking(false);
    localStorage.setItem('is_tracking', 'false');
    localStorage.setItem('my_elapsed_time', elapsedTime.toString());
  };

  // 전체 초기화
  const handleClearPath = () => {
    setPath([]);
    setMemos({});
    setAltitude(null);
    setTotalDistance(0);
    setElapsedTime(0);
    setIsTracking(false);
    
    localStorage.removeItem('my_path');
    localStorage.removeItem('my_memos');
    localStorage.removeItem('is_tracking');
    localStorage.removeItem('my_start_time');
    localStorage.removeItem('my_elapsed_time');
    localStorage.removeItem('my_altitude');
  };

  const handleMemoChange = (index, text) => {
    setMemos((prev) => ({ ...prev, [index]: text }));
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
    <div style={{ width: '100vw', height: '100vh', position: 'relative', fontFamily: 'sans-serif' }}>
      
      {/* 조작 및 정보 패널 */}
      <div style={{ 
        position: 'absolute', 
        top: 20, 
        left: '50%', 
        transform: 'translateX(-50%)', 
        zIndex: 1000, 
        background: 'white', 
        padding: '10px 15px', 
        borderRadius: '10px', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
        textAlign: 'center',
        width: '90%',
        maxWidth: '380px'
      }}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            width: '100%', 
            padding: '6px', 
            fontSize: '13px', 
            backgroundColor: '#e0e0e0', 
            border: 'none', 
            borderRadius: '5px', 
            cursor: 'pointer',
            fontWeight: 'bold',
            marginBottom: isOpen ? '8px' : '0'
          }}
        >
          {isOpen ? '▲ 기록소 숨기기' : '▼ 나만의 발자취 기록소 열기'}
        </button>

        {isOpen && (
          <>
            <h3 style={{ margin: '0 0 5px 0' }}>퇴근길 발자취 기록소</h3>
            <p style={{ fontSize: '11px', color: '#555', margin: '0 0 6px 0' }}>
              위치·고도·거리·시간 측정 및 메모 남기기 기능 포함
            </p>
            
            {errorMsg && <p style={{ fontSize: '12px', color: 'red', margin: '5px 0' }}>{errorMsg}</p>}
            
            <div style={{ background: '#f8f9fa', padding: '8px', borderRadius: '6px', margin: '6px 0', fontSize: '13px', textAlign: 'left' }}>
              <div>📍 상태: <b>{isTracking ? '추적 중...' : '대기 중'}</b></div>
              <div>📏 총 이동 거리: <b style={{ color: '#2196F3' }}>{totalDistance.toFixed(2)} km</b></div>
              <div>⏱️ 소요 시간: <b>{formatTime(elapsedTime)}</b></div>
              <div>⛰️ 현재 고도: <span style={{ color: '#4CAF50' }}>{altitude !== null ? `${altitude.toFixed(1)} m` : '대기 중'}</span></div>
              <div>📌 총 포인트: <b>{path.length}개</b></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              {!isTracking ? (
                <button 
                  onClick={startTracking}
                  style={{ flex: 1, padding: '8px', fontSize: '14px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                >
                  추적 시작
                </button>
              ) : (
                <button 
                  onClick={pauseTracking}
                  style={{ flex: 1, padding: '8px', fontSize: '14px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                >
                  일시정지
                </button>
              )}

              <button 
                onClick={handleClearPath}
                style={{ padding: '8px 12px', fontSize: '14px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                전체 초기화
              </button>
            </div>
          </>
        )}
      </div>

      {/* 지도 영역 */}
      <MapContainer 
        center={[center.lat, center.lng]} 
        zoom={16} 
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        <MapRecenter center={center} />

        {/* 이동 경로 선 (전체 경로를 선으로 부드럽게 연결) */}
        <Polyline positions={path} color="#2196F3" weight={5} opacity={0.8} />
        
        {/* 📌 출발지(첫 번째 포인트)와 도착지(마지막 포인트)에만 마커 표시 */}
        {path.length > 0 && (
          <Marker position={path[0]}>
            <Popup>
              <div><b>출발지</b><br/><span style={{ fontSize: '11px', color: '#666' }}>{path[0][0].toFixed(4)}, {path[0][1].toFixed(4)}</span></div>
            </Popup>
          </Marker>
        )}

        {path.length > 1 && (
          <Marker position={path[path.length - 1]}>
            <Popup>
              <div><b>현재 위치 (도착지)</b><br/><span style={{ fontSize: '11px', color: '#666' }}>{path[path.length - 1][0].toFixed(4)}, {path[path.length - 1][1].toFixed(4)}</span></div>
            </Popup>
          </Marker>
        )}
        
      </MapContainer>
    </div>
  );
}

export default App;