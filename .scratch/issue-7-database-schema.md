# Issue #7: 데이터베이스 스키마 설계 및 초기화 (SQLite)

**Label:** ready-for-agent  
**Blocked by:** #6 (프로젝트 부트스트랩)

## What to build

MVP 전체 데이터 플로우를 지원하는 SQLite 스키마를 설계하고 초기화합니다.

**필수 테이블:**
- `assets` — 서버 자산 (IP, 호스트명, OS, 계정정보(암호화), 마지막 스캔 시간)
- `users` — 사용자 (사용자명, 해시 비밀번호, 역할: Admin/Viewer)
- `scan_results` — 스캔 결과 (타임스탐프, 자산 ID, 성공/실패, 수집 정보 JSON)
- `vulnerabilities` — 취약점 (CVE ID, 제목, 심각도, CVSS, 근본 원인(한국어), 조치(한국어), 영향 서버 목록)
- `cve_cache` — NVD CVE 캐시 (CVE ID, 제목, 설명, CVSS, 업데이트 시간)

**보안 설계:**
- `assets.password`, `assets.ssh_key` 필드는 BLOB으로 저장 (AES-256 암호화, 애플리케이션 레이어)
- 암호화 키는 환경변수 `INFRA_SECURITY_MASTER_KEY`에서 로드
- `users.password` 필드는 TEXT (bcrypt 해시)

**초기화 방식:**
- Python 스크립트로 SQLite 테이블 생성 (`/backend/db/init.py`)
- 애플리케이션 시작 시 자동으로 DB 파일 및 테이블 생성
- 마이그레이션 필요 시 별도 스크립트로 관리

**자동 백업 전략:**
- 매일 정시(02:00)에 자동 백업 생성 (APScheduler 사용)
- 백업 파일: `./data/backups/infra_security_YYYYMMDD.db.backup`
- 실패 시 자동 재시도: 30초 간격, 최대 3회
- 재시도 실패 시 로그 기록 및 담당자 경고

## Acceptance criteria

- [ ] 위 5개 테이블이 SQLite에 생성됨
- [ ] assets 테이블의 password, ssh_key 필드가 BLOB 타입
- [ ] users 테이블에 role 컬럼 (TEXT: 'admin' 또는 'viewer')
- [ ] scan_results와 vulnerabilities 간 외래키 관계 정의됨
- [ ] `docker-compose up` 후 DB 자동 초기화 (`/backend/db/init.py` 실행)
- [ ] SQLite 파일이 `/data/infra_security.db`에 생성됨
- [ ] 자동 백업 기능 구현 (매일 02:00에 `/data/backups/` 저장)
- [ ] 백업 실패 시 자동 재시도 (30초 간격 최대 3회)
- [ ] 백업 실패 로그 기록 및 담당자 경고 메시지
