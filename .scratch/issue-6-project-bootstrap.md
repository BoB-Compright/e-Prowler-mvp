# Issue #6: 프로젝트 부트스트랩 (FastAPI + React + PostgreSQL)

**Label:** ready-for-agent  
**Blocked by:** None - can start immediately

## What to build

개발팀이 로컬에서 즉시 개발을 시작할 수 있는 완전한 프로젝트 기초를 구축합니다.

**백엔드:**
- FastAPI 애플리케이션 골격 (비동기 지원)
- SQLAlchemy ORM + PostgreSQL 드라이버
- 프로젝트 루트 구조: `/backend/app/main.py`, `/backend/app/models/`, `/backend/app/routes/`

**프론트엔드:**
- React + TypeScript + Vite 프로젝트
- 프로젝트 루트 구조: `/frontend/src/pages/`, `/frontend/src/components/`
- 기본 라우팅 설정 (홈, 대시보드)

**개발 환경:**
- Docker Compose: PostgreSQL + 백엔드 + 프론트엔드 서비스
- 로컬 개발 환경: `docker-compose up` 이후 http://localhost:3000, http://localhost:8000 접근 가능
- `.env.example` 파일로 필수 환경변수 템플릿 제공

## Acceptance criteria

- [ ] FastAPI 애플리케이션이 `http://localhost:8000/docs` (Swagger)에서 실행됨
- [ ] React 개발 서버가 `http://localhost:3000`에서 실행됨
- [ ] Docker Compose로 전체 스택 원커맨드 실행 가능 (`docker-compose up`)
- [ ] PostgreSQL 컨테이너가 `postgres://user:password@localhost:5432/infra_security`로 연결 가능
- [ ] README에 로컬 개발 환경 구성 방법 설명 (Python 3.9+, Node 16+)
