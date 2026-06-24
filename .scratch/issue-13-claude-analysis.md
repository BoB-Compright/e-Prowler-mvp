# Issue #13: Claude API 취약점 분석 (스토리 #33~#39)

**Label:** ready-for-agent  
**Blocked by:** #11 (OS 정보 수집 실행)

## What to build

수집된 OS 정보를 Claude API로 분석하여 취약점을 식별하고, CVSS 심각도로 분류한 뒤, 한국어 조치방안을 생성합니다.

**트리거:**
- 스캔 결과가 scan_results 테이블에 저장된 직후
- 또는 `POST /analyze` 엔드포인트로 수동 호출

**입력:**
```json
{
  "scan_id": "scan-20260624-153000",
  "collected_data": {
    "os_version": "Ubuntu 20.04",
    "kernel": "5.4.0",
    "packages": [
      {"name": "openssl", "version": "1.1.1f"},
      {"name": "openssh-server", "version": "7.4"}
    ],
    "services": ["sshd", "apache2"],
    "firewall_rules": "..."
  }
}
```

**Claude API 호출:**
- 모델: claude-3-5-sonnet (또는 지정된 모델)
- 프롬프트: OS 정보 기반 잠재 취약점 분석 (한국어)
- 응답 형식 (구조화):
```json
{
  "vulnerabilities": [
    {
      "name": "OpenSSL 구버전 취약점",
      "severity": "High",
      "cvss_score": 7.5,
      "root_cause_ko": "OpenSSL 1.1.1f는 XX 취약점에 노출되어 있습니다.",
      "mitigation_ko": "OpenSSL을 1.1.1l 이상으로 업그레이드하십시오.",
      "affected_assets": [1, 3, 5]
    }
  ]
}
```

**저장:**
- vulnerabilities 테이블에 INSERT
- affected_assets는 JSON 배열로 저장

## Acceptance criteria

- [ ] Claude API 호출 로직 구현됨 (환경변수 API 키 로드)
- [ ] 수집된 OS 정보를 프롬프트로 변환하는 로직 작동
- [ ] Claude API 응답이 구조화된 JSON으로 파싱됨
- [ ] 취약점이 severity(Critical/High/Medium/Low)로 분류됨
- [ ] 조치방안이 한국어로 생성됨
- [ ] 영향받는 서버 목록이 포함됨
- [ ] 테스트: 정상 응답, API 오류 처리, 타임아웃
