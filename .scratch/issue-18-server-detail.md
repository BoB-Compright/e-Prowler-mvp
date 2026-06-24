# Issue #18: 서버 상세 페이지 (스토리 #50~#51)

**Label:** ready-for-agent  
**Blocked by:** #17 (취약점 목록 페이지)

## What to build

자산 목록에서 특정 서버를 클릭하면 그 서버의 모든 취약점을 표시하는 상세 페이지를 구현합니다.

**백엔드 - 엔드포인트:** `GET /servers/{server_id}/vulnerabilities?page=1&limit=20`

**응답:**
```json
{
  "server": {
    "id": 1,
    "ip": "192.168.1.10",
    "hostname": "web-server-01",
    "os_type": "Ubuntu 20.04",
    "last_scan_time": "2026-06-24T14:30:00Z"
  },
  "vulnerabilities": {
    "total": 8,
    "page": 1,
    "limit": 20,
    "items": [
      {
        "cve_id": "CVE-2021-1234",
        "title": "OpenSSL 원격 코드 실행",
        "severity": "Critical",
        "cvss_score": 9.8,
        "mitigation_ko": "OpenSSL을 1.1.1l 이상으로 업그레이드...",
        "nvd_link": "https://nvd.nist.gov/vuln/detail/CVE-2021-1234"
      }
    ]
  }
}
```

**프론트엔드:**
- 상단: 서버 정보 (IP, 호스트명, OS, 마지막 스캔)
- 중앙: 이 서버만의 취약점 테이블
  - CVE ID, 제목, 심각도(색상), CVSS, 조치방안(한국어), NVD 링크
- 네비게이션: 서버 목록으로 돌아가기

## Acceptance criteria

- [ ] `GET /servers/{server_id}/vulnerabilities` 엔드포인트 구현됨
- [ ] 서버 정보가 상단에 표시됨
- [ ] 해당 서버만의 취약점이 정확하게 필터링됨
- [ ] 페이지네이션 지원됨
- [ ] 심각도 색상 코딩 적용
- [ ] NVD 링크가 클릭 가능한 링크로 표시됨
- [ ] 서버 목록으로 돌아가는 버튼 있음
- [ ] 테스트: 취약점 없는 서버, 많은 취약점, 존재하지 않는 서버 ID
