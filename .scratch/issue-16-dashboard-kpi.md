# Issue #16: 대시보드 KPI 표시 (스토리 #46~#49)

**Label:** ready-for-agent  
**Blocked by:** #13, #15 (취약점 데이터 생성)

## What to build

보안팀이 전체 인프라 보안 상황을 한눈에 파악할 수 있는 대시보드 KPI 카드와 차트를 구현합니다.

**백엔드 - 엔드포인트:** `GET /dashboard/metrics`

**응답:**
```json
{
  "overview": {
    "total_servers": 42,
    "healthy_servers": 35,
    "warning_servers": 5,
    "critical_servers": 2
  },
  "vulnerabilities": {
    "critical": 3,
    "high": 12,
    "medium": 28,
    "low": 45,
    "total": 88
  },
  "last_scan": "2026-06-24T14:30:00Z"
}
```

**프론트엔드:**
- 상단: 4개 KPI 카드 (전체 서버, 정상, 경고, 위험)
- 중앙: 파이 차트 (심각도별 취약점 분포: Critical/High/Medium/Low)
- 하단: 최근 스캔 시간

**차트 라이브러리:**
- React Chart.js 또는 Recharts 사용

## Acceptance criteria

- [ ] `GET /dashboard/metrics` 엔드포인트 구현됨 (SQLite 쿼리)
- [ ] 상태 계산 로직 정확함 (healthy/warning/critical 카운트)
- [ ] 심각도별 취약점 카운트 정확함
- [ ] React 컴포넌트로 4개 KPI 카드 렌더링됨
- [ ] 파이 차트가 심각도 분포를 시각화함
- [ ] 대시보드 로드 시간 <2초 (노트북 성능)
- [ ] 1분 폴링으로 자동 갱신됨 (WebSocket 불필요)
- [ ] 스타일링: 기본 공백 레이아웃 (디자인은 Post-MVP)
- [ ] 테스트: 데이터 없는 경우, 여러 서버/취약점, 부분 데이터
