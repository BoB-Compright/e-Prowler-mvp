# Issue #8: CSV 자산 업로드 & 저장 (스토리 #1)

**Label:** ready-for-agent  
**Blocked by:** #7 (데이터베이스 스키마)

## What to build

CSV 파일에서 서버 자산 정보(IP, 호스트명, OS 타입, 계정)를 읽어 데이터베이스에 저장합니다.

**엔드포인트:** `POST /assets/upload`

**입력:**
- CSV 파일 (멀티파트 폼 데이터)
- 예상 컬럼: ip, hostname, os_type, username, password, ssh_key (선택)

**처리 로직:**
1. 파일 업로드 검증 (크기, 확장자)
2. CSV 파싱 (pandas 또는 csv 라이브러리)
3. 각 행 검증 (IP 유효성, 호스트명 형식)
4. 계정 정보 암호화 (AES-256)
5. 데이터베이스 저장 (배치 INSERT)

**응답:**
```json
{
  "total_rows": 10,
  "success_count": 8,
  "failed_count": 2,
  "failed_rows": [
    {"row_number": 3, "reason": "Invalid IP format"},
    {"row_number": 7, "reason": "Missing hostname"}
  ]
}
```

## Acceptance criteria

- [ ] `POST /assets/upload` 엔드포인트 구현됨
- [ ] CSV 파일 파싱 및 검증 로직 작동
- [ ] 계정 정보(password, ssh_key)가 AES-256으로 암호화되어 저장됨
- [ ] 실패한 행의 이유를 상세히 응답함
- [ ] 성공한 자산이 `assets` 테이블에 저장됨
- [ ] 테스트: 정상 CSV, 잘못된 형식, 빈 파일 등 엣지 케이스 포함
