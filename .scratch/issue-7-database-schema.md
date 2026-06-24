# Issue #7: 데이터베이스 스키마 설계 및 마이그레이션

**Label:** ready-for-agent  
**Blocked by:** #6 (프로젝트 부트스트랩)

## What to build

MVP 전체 데이터 플로우를 지원하는 PostgreSQL 스키마를 설계하고 마이그레이션합니다.

**필수 테이블:**
- `assets` — 서버 자산 (IP, 호스트명, OS, 계정정보(암호화), 마지막 스캔 시간)
- `users` — 사용자 (사용자명, 해시 비밀번호, 역할: Admin/Viewer)
- `scan_results` — 스캔 결과 (타임스탐프, 자산 ID, 성공/실패, 수집 정보 JSON)
- `vulnerabilities` — 취약점 (CVE ID, 제목, 심각도, CVSS, 근본 원인(한국어), 조치(한국어), 영향 서버 목록)
- `cve_cache` — NVD CVE 캐시 (CVE ID, 제목, 설명, CVSS, 업데이트 시간)

**보안 설계:**
- `assets.password`, `assets.ssh_key` 필드는 AES-256 암호화 (애플리케이션 레이어)
- 암호화 키는 환경변수 `INFRA_SECURITY_MASTER_KEY`에서 로드
- `users.password` 필드는 bcrypt 해시

**마이그레이션:**
- Alembic을 사용한 버전 관리
- `/backend/alembic/versions/` 에 초기 스키마 마이그레이션 파일

## Acceptance criteria

- [ ] 위 5개 테이블이 PostgreSQL에 생성됨
- [ ] assets 테이블의 password, ssh_key 필드가 BYTEA 타입 (암호화 저장)
- [ ] users 테이블에 role 컬럼 (ENUM: admin, viewer)
- [ ] scan_results와 vulnerabilities 간 외래키 관계 정의됨
- [ ] `docker-compose up` 후 마이그레이션 자동 실행됨 (`alembic upgrade head`)
