# Issue #12: 스캔 진행 상황 API (스토리 #62)

**Label:** ready-for-agent  
**Blocked by:** #11 (OS 정보 수집 실행)

## What to build

진행 중인 스캔의 상태를 실시간으로 조회하는 API 엔드포인트를 구현합니다.

**엔드포인트:** `GET /scan/status/{scan_id}`

**응답:**
```json
{
  "scan_id": "scan-20260624-153000",
  "status": "in_progress",
  "total_servers": 10,
  "completed": 7,
  "failed": 1,
  "in_progress": 2,
  "start_time": "2026-06-24T15:30:00Z",
  "estimated_completion": "2026-06-24T15:34:30Z",
  "results": [
    {
      "asset_id": 1,
      "hostname": "web-server-01",
      "status": "success",
      "collected_packages_count": 125
    },
    {
      "asset_id": 2,
      "hostname": "db-server-01",
      "status": "failed",
      "error": "Connection timeout"
    }
  ]
}
```

## Acceptance criteria

- [ ] `GET /scan/status/{scan_id}` 엔드포인트 구현됨
- [ ] 실시간 진행 상황 반영 (completed, failed, in_progress 카운트)
- [ ] 각 서버의 개별 스캔 결과 포함 (성공/실패, 수집한 패키지 수)
- [ ] 예상 완료 시간 계산 및 제시
- [ ] 테스트: 진행 중, 완료, 실패 상태
