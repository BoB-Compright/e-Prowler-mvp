# Issue #14: NVD CVE 데이터 캐싱 (스토리 #41, #43)

**Label:** ready-for-agent  
**Blocked by:** #7 (데이터베이스 스키마)

## What to build

NVD (National Vulnerability Database) API에서 최신 CVE 데이터를 다운로드하여 로컬 PostgreSQL에 캐싱합니다.

**엔드포인트:** `POST /cve/update` (수동 업데이트)

**처리 로직:**
1. NVD CVE API 호출 (https://services.nvd.nist.gov/rest/json/cves)
2. CVE 데이터 파싱 (CVE ID, 제목, 설명, CVSS 스코어, 영향받는 패키지)
3. 로컬 cve_cache 테이블에 저장 (덮어쓰기 또는 업데이트)
4. 타임스탐프 기록

**응답:**
```json
{
  "status": "success",
  "total_cves_synced": 1250,
  "last_updated": "2026-06-24T15:45:00Z"
}
```

**캐시 폴백:**
- NVD API 다운 시: 로컬 캐시 데이터 사용하여 스캔 계속 진행 (에러 없음)

**선택사항 (MVP 범위):**
- 일일 자동 업데이트는 구현하지 않음 (수동 호출만)

## Acceptance criteria

- [ ] `POST /cve/update` 엔드포인트 구현됨
- [ ] NVD API에서 최신 CVE 데이터 다운로드됨
- [ ] CVE 데이터가 cve_cache 테이블에 저장됨
- [ ] 업데이트 완료 후 타임스탐프 기록
- [ ] NVD API 오류 시 로컬 캐시 폴백 작동 (에러 로그만 기록)
- [ ] 테스트: 정상 응답, API 오류, 타임아웃, 빈 응답
