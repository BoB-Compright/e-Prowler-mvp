# AI 기반 인프라(OS) 보안 점검 도구 (MVP)

온프레미스 클라우드 환경의 Linux 서버에 대해 **자동화된 OS 취약점 점검**을 수행하고, **Claude AI를 활용한 한국어 조치방안**을 제시하는 도구입니다.

**담당자 노트북 기반 운영** - Docker Desktop에서 실행되며, 웹 브라우저로 접근 가능합니다.

---

## 📋 시스템 요구사항

### 노트북 스펙 (권장)
- **OS**: Windows 10+ / macOS 10.14+ / Ubuntu 18.04+
- **CPU**: 6코어 이상
- **메모리**: 12GB 이상
- **디스크**: 20GB 이상 (데이터베이스 + 도커 이미지)

### 필수 소프트웨어
- **Docker Desktop** 4.0+
- **Git** 2.30+
- **Python** 3.9+ (로컬 개발 시)
- **Node.js** 16+ (로컬 개발 시)

### 네트워크
- 온프레미스 클라우드 내부 LAN 직접 연결
- SSH 포트 22 (대상 서버) 접근 가능

---

## 🚀 빠른 시작

### 1. 저장소 클론
```bash
git clone https://github.com/BoB-Compright/e-Prowler-mvp.git
cd e-Prowler-mvp
```

### 2. 환경 변수 설정
```bash
# .env 파일 생성 (템플릿에서)
cp .env.example .env

# .env 파일 편집 - 다음을 설정하세요:
# INFRA_SECURITY_MASTER_KEY=<AES-256 암호화 키>
# ANTHROPIC_API_KEY=<Claude API 키>
```

⚠️ **중요**: `.env` 파일은 절대 Git에 커밋하지 마세요. `.gitignore`에 이미 등록되어 있습니다.

### 3. Docker Desktop 시작
```bash
# Docker Desktop 애플리케이션 실행 (또는 `docker` 명령 직접 사용)
docker-compose up -d
```

### 4. 애플리케이션 접근
- **웹 대시보드**: http://localhost:3000
- **API 문서 (Swagger)**: http://localhost:8000/docs

### 5. 초기 데이터 로드
대시보드에 접속한 후:
1. **자산 업로드** 메뉴에서 CSV 파일 업로드 (서버 IP, 호스트명, OS, 계정정보)
2. **스캔 시작** 버튼 클릭
3. 진행 상황 실시간 모니터링

---

## 🔐 보안 설정

### 암호화 키 관리

#### 1. 암호화 키 생성
```python
import secrets
import base64

# 32바이트 AES-256 키 생성
key = secrets.token_bytes(32)
encoded_key = base64.b64encode(key).decode()
print(f"INFRA_SECURITY_MASTER_KEY={encoded_key}")
```

#### 2. .env 파일에 저장
```
INFRA_SECURITY_MASTER_KEY=<위에서 생성한 키>
ANTHROPIC_API_KEY=sk-...
```

#### 3. 보안 권장사항
- **노트북 분실 시**: 백업 데이터는 복구 불가능 (암호화 키가 없으므로)
- **팀 공유**: 불가능 (단일 담당자만 사용)
- **정기 백업**: 매일 자동 백업, 추가로 USB/클라우드에 수동 백업

---

## 💾 데이터 백업

### 자동 백업
- **매일 자동 생성**: 애플리케이션이 매일 `infra_security.db.backup` 파일 생성
- **저장 위치**: `./data/infra_security.db.backup`
- **실패 시**: 자동 재시도 (최대 3회) + 로그 기록

### 수동 백업
```bash
# 현재 데이터베이스 백업
cp ./data/infra_security.db ~/backup/infra_security_$(date +%Y%m%d).db

# 또는 USB/클라우드 동기화
# - Windows: OneDrive, Google Drive, Dropbox
# - macOS: iCloud Drive, Google Drive
```

### 복구
```bash
# 백업에서 복구 (애플리케이션 중지 후)
docker-compose down
cp ~/backup/infra_security_YYYYMMDD.db ./data/infra_security.db
docker-compose up -d
```

---

## 🛠️ 개발 설정

### 로컬 개발 (Docker 없이)

#### 백엔드 (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# SQLite 초기화
python db/init.py

# 개발 서버 실행
uvicorn app.main:app --reload --port 8000
```

#### 프론트엔드 (React)
```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

---

## 🔍 주요 기능

### 1. 자산 관리
- CSV/Excel/JSON 파일로 대량 업로드
- 웹 대시보드에서 수동 추가/수정/삭제
- 자동 중복 검사

### 2. OS 정보 수집
- **Ansible/SSH로 자동 수집**
  - 패키지 목록 및 버전
  - 서비스 상태
  - 방화벽 규칙
  - 사용자 권한
  - SELinux 상태
- **병렬 실행**: 최대 5대 서버 동시 스캔
- **타임아웃**: 서버당 5분
- **재시도**: 30초 간격 최대 3회

### 3. AI 기반 취약점 분석
- **Claude API** 활용
- **CVSS 심각도 분류** (Critical/High/Medium/Low)
- **한국어 조치방안** 자동 생성

### 4. CVE 데이터 매칭
- **NVD API** 연동
- **패키지 버전 범위 매칭**
- **로컬 캐시** (API 다운 시 폴백)

### 5. 웹 대시보드
- **KPI 카드**: 서버 상태, 취약점 분포
- **취약점 목록**: 심각도별 필터링, 서버별 조회
- **1분 폴링**: 자동 갱신
- **한국어 조치방안** 표시

---

## 📊 API 명세

### 주요 엔드포인트

**자산 관리**
```
POST   /assets/upload       # CSV/Excel 업로드
GET    /assets             # 모든 자산 조회 (페이지네이션)
```

**스캔 실행**
```
POST   /scan               # 전체 플릿 스캔 시작
GET    /scan/status/{id}   # 스캔 진행 상황 조회
```

**취약점 조회**
```
GET    /vulnerabilities    # 취약점 목록 (필터링, 페이지네이션)
GET    /servers/{id}/vulnerabilities  # 서버별 취약점
```

**대시보드**
```
GET    /dashboard/metrics  # KPI 메트릭
```

상세한 API 문서는 **http://localhost:8000/docs** 참고

---

## 🐛 문제 해결

### Docker 컨테이너가 시작되지 않음
```bash
# 로그 확인
docker-compose logs -f

# 컨테이너 재시작
docker-compose restart

# 전체 재시작
docker-compose down
docker-compose up -d
```

### SQLite "database is locked" 오류
- 여러 프로세스가 DB에 접근 중
- 해결: `docker-compose restart` 실행

### SSH 접근 실패
- 대상 서버 SSH 포트 22 확인
- 노트북과 대상 서버가 같은 LAN에 있는지 확인
- SSH 계정 정보 (IP, 사용자명, 비밀번호/키) 확인

### Claude API 오류
- `ANTHROPIC_API_KEY` 올바른지 확인
- API 할당량 확인 (https://console.anthropic.com)

---

## 📚 문서

- [PRD (제품 요구사항)](./PRD_KO.md) - 전체 기능 명세
- [GitHub Issues](https://github.com/BoB-Compright/e-Prowler-mvp/issues) - 개발 로드맵
- [로컬 이슈 문서](./.scratch/) - 온/오프라인 참고용

---

## 📞 지원

질문이나 버그 보고는 GitHub Issues에 등록해주세요.

---

## 📝 라이선스

내부 전용 도구 (라이선스 미정의)

---

**마지막 업데이트**: 2026-06-24  
**상태**: MVP 개발 중
