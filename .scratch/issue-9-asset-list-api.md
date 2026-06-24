# Issue #9: 자산 목록 조회 API (스토리 #9)

**Label:** ready-for-agent  
**Blocked by:** #7 (데이터베이스 스키마)

## What to build

데이터베이스에 저장된 모든 자산을 조회하는 API 엔드포인트를 구현합니다.

**엔드포인트:** `GET /assets?page=1&limit=20`

**응답:**
```json
{
  "total": 42,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "id": 1,
      "ip": "192.168.1.10",
      "hostname": "web-server-01",
      "os_type": "Ubuntu 20.04",
      "last_scan_time": "2026-06-24T10:30:00Z",
      "status": "healthy"
    }
  ]
}
```

**상태 계산 로직:**
- healthy: 취약점 없음
- warning: Medium 이상의 취약점 있음
- critical: Critical 취약점 있음

## Acceptance criteria

- [ ] `GET /assets` 엔드포인트 구현됨
- [ ] 페이지네이션 지원 (page, limit 쿼리 파라미터)
- [ ] 각 자산의 id, ip, hostname, os_type, last_scan_time, status 반환
- [ ] 상태 계산이 정확함 (vulnerable 쿼리 기반)
- [ ] 테스트: 빈 자산 목록, 페이지 경계 케이스
