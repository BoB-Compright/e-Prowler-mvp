# Issue #6: 프로젝트 부트스트랩 (FastAPI + React + SQLite)

**Label:** ready-for-agent  
**Blocked by:** None - can start immediately

## What to build

개발팀이 담당자 노트북(Docker Desktop)에서 즉시 개발을 시작할 수 있는 완전한 프로젝트 기초를 구축합니다.

**백엔드:**
- FastAPI 애플리케이션 골격 (비동기 지원)
- SQLite ORM (SQLAlchemy) + 파일 기반 DB
- 프로젝트 루트 구조: `/backend/app/main.py`, `/backend/app/models/`, `/backend/app/routes/`

**프론트엔드:**
- React + TypeScript + Vite 프로젝트
- 프로젝트 루트 구조: `/frontend/src/pages/`, `/frontend/src/components/`
- 기본 라우팅 설정 (홈, 대시보드)

**개발 환경:**
- Docker Compose: 백엔드 + 프론트엔드 서비스 (DB 컨테이너 제거, SQLite 파일 기반)
- 로컬 개발 환경: `docker-compose up` 이후 http://localhost:3000, http://localhost:8000 접근 가능
- `.env.example` 파일로 필수 환경변수 템플릿 제공
- SQLite DB 파일: `./data/infra_security.db` (Docker 볼륨으로 마운트)

## Acceptance criteria

- [ ] FastAPI 애플리케이션이 `http://localhost:8000/docs` (Swagger)에서 실행됨
- [ ] React 개발 서버가 `http://localhost:3000`에서 실행됨
- [ ] Docker Compose로 전체 스택 원커맨드 실행 가능 (`docker-compose up`)
- [ ] SQLite DB 파일이 `./data/infra_security.db`에 생성됨 (Docker 볼륨 마운트 확인)
- [ ] docker-compose.yml에 PostgreSQL 제거, SQLite 설정 추가
- [ ] .env.example 파일 생성 (ANTHROPIC_API_KEY, INFRA_SECURITY_MASTER_KEY 포함)
- [ ] .gitignore에 .env 파일 등록 (암호화 키 보호)
- [ ] README.md 생성 (노트북 스펙, Docker 설정, .env 관리, 백업 방법 포함)
