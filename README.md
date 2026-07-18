# NH-Guardian

**AI 상시 보안 점검 체계** — 서버·레포지토리 자산을 한 번 등록하면, KISA·CIS 기준 보안 점검부터 AI 분석 보고서, 실시간 CVE 감시, 경영진·PM 공유까지 전 과정이 자동으로 돌아가는 자산 중심 보안 점검 플랫폼입니다.

![NH-Guardian 대시보드](docs/images/dashboard.jpg)

---

## 왜 NH-Guardian인가

보안 담당자의 하루는 이렇게 흘러갑니다. 여러 프로젝트에 흩어진 수십 대의 서버와 컨테이너 이미지를 사람 손으로, 담당자마다 다른 기준으로 점검합니다. 점검 스크립트가 뱉어낸 raw 로그를 해석해 보고서로 정리하는 데 또 하루가 갑니다. 그렇게 한 번 점검하고 나면 끝 — 다음 점검 전까지 새로 공개되는 취약점(CVE)은 아무도 지켜보지 않고, 결과를 프로젝트 책임자에게 전달할 표준 경로도 없습니다.

NH-Guardian은 이 과정 전체를 하나의 플랫폼으로 통합합니다.

- **점검 자동화** — 서버는 SSH로, 레포지토리는 Docker 샌드박스로 자동 점검. 186개 점검 항목(KISA 주요정보통신기반시설 가이드 + CIS Benchmark)을 몇 분 안에 수행합니다.
- **AI가 해석까지** — Claude AI가 점검 증거(evidence)를 근거로 판정 이유·위험도·조치방안·설정 예시를 실무에 바로 쓸 수 있는 한국어 보고서로 만들어 줍니다.
- **한 번 등록하면 상시 감시** — 정기 점검 스케줄이 자동으로 돌고, 서버에 설치된 패키지를 NVD(미국 국립 취약점 DB)와 상시 대조해 새 CVE가 공개되는 즉시 알려줍니다.
- **결과 공유는 링크 하나로** — 비밀번호로 보호된 공유 링크(QR 코드 지원)를 통해 보안 지식이 없는 프로젝트 책임자도 자기 프로젝트의 보안 점수와 상세 리포트를 읽기 전용으로 열람합니다.

숫자로 요약하면: **점검 항목 186개 · 벤더 팩 13종(OS/컨테이너/웹/WAS/DB/Windows) · 자동화된 테스트 1,119개 통과.**

---

## 주요 기능

### 1. 보안 현황 대시보드 — 조직 전체를 한 화면에

앱을 열면 가장 먼저 보이는 화면입니다. 전체 자산 수, 취약 자산, 미해결 CVE, 활성 스케줄 등 핵심 지표와 함께 **종합 보안 점수(0~100)** 게이지가 조직의 현재 보안 수준을 즉시 보여줍니다.

- 자산 상태 분포 도넛 차트(양호/검토/취약/진행 중/미점검)
- 위험 자산 TOP 5 — 어떤 자산부터 손대야 하는지 우선순위 제시
- 최근 7일 신규 CVE 경보 및 고위험 CVE TOP 5
- 최근 점검 활동 피드

![신규 CVE 경보와 고위험 CVE TOP 5](docs/images/dashboard-cve-alerts.jpg)

### 2. 자산 관리 — 서버·레포지토리를 한 곳에서

점검 대상을 "자산"으로 등록해 관리합니다. 서버(SSH 접속 정보)와 레포지토리(GitHub URL) 두 유형을 지원하고, 각 자산은 OS / WEB / WAS / DB / Windows 종류로 분류되어 종류에 맞는 점검 항목이 자동으로 매칭됩니다.

![자산 관리 화면](docs/images/assets.jpg)

- **엑셀 일괄 업로드** — 작성용 템플릿을 내려받아 수십 대 서버를 한 번에 등록 (행별 best-effort 처리)
- **레포 가져오기** — GitHub 레포 하나에서 여러 Dockerfile을 자동 탐지해 이미지별 자산으로 일괄 등록
- **중복 자동 방지** — 레포는 정규화 URL, 서버는 IP+포트 조합으로 중복 등록 차단
- **SSH 자격증명 암호화** — 접속 정보는 AES-256-GCM으로 암호화 저장되며, 화면·로그·AI 입력 어디에도 평문으로 노출되지 않습니다

### 3. 자산 상세 허브 — 자산 하나의 모든 것

자산을 클릭하면 점검 실행, 정기 점검 설정, 감지된 CVE, 점검 이력이 한 화면에 모입니다. "이 서버 지금 어떤 상태지?"라는 질문에 이 화면 하나로 답합니다.

![자산 상세 — 자산 정보와 점검 시작](docs/images/asset-detail.jpg)

정기 점검은 매일/매주/매월 주기와 실행 시각만 고르면 됩니다. 서버가 꺼져 있던 동안 놓친 스케줄은 재기동 시 자동으로 따라잡아(catch-up) 실행됩니다. 감지된 CVE는 심각도별 필터와 함께 한국어로 번역된 요약을 보여주고, 오탐은 "무시" 처리할 수 있습니다.

![자산 상세 — 정기 점검 설정과 감지된 CVE](docs/images/asset-cve-schedule.jpg)

### 4. 점검 실행 — 카테고리를 골라 필요한 만큼만

점검 시작 시 자산에 해당하는 점검 카테고리(OS/WEB/WAS/DB/Windows/컨테이너)를 선택할 수 있어, 대상 항목과 소요 시간을 줄일 수 있습니다. 이 카테고리 선택은 자산 상세·자산 목록·리포트 재점검·CVE 재스캔 등 모든 점검 진입점에서 동일하게 동작합니다.

![점검 카테고리 선택 모달](docs/images/scan-category-modal.jpg)

내부적으로 두 종류의 점검 파이프라인이 동작합니다.

- **서버 점검**: `연결(SSH) → Ansible 점검 → 룰 평가 → AI 분석 → 완료`. 비밀번호/SSH 키 인증을 모두 지원하고, 연결 실패는 30초 간격 자동 재시도, 인증 실패는 자격증명 노출 없이 즉시 실패 처리합니다.
- **레포(컨테이너) 점검**: `클론 → Docker 빌드 → 샌드박스 기동 → Ansible 점검 → 룰 평가 → AI 분석 → 완료`. 클론/빌드가 불가능한 폐쇄망 환경에서는 로컬 Docker 이미지로 샌드박스 단계부터 재개하는 폴백을 제공합니다. 샌드박스는 10분 수명 제한으로 강제 정리되고, 일회용 빌드 이미지는 자동 삭제됩니다.

프로젝트 단위 **일괄 점검(fleet scan)** 은 최대 5대를 동시에 점검하며, 한 서버의 실패가 배치 전체를 중단시키지 않도록 격리됩니다.

### 5. 점검 카탈로그 — 어떤 기준으로 점검하는지 투명하게

점검 항목 전체(186개)를 프레임워크·카테고리·심각도·자동화 여부로 탐색할 수 있는 참조 화면입니다. "우리 점검이 어떤 근거로 이뤄지는가"에 대한 답이기도 합니다.

![보안 점검 카탈로그](docs/images/catalog.jpg)

| 프레임워크 | 카테고리 | 항목 수 |
|---|---|---|
| KISA 주요정보통신기반시설 가이드 | Unix 서버 (U-01~U-67) | 67 |
| KISA 주요정보통신기반시설 가이드 | 웹서비스 (WEB-01~WEB-26) | 26 |
| KISA 주요정보통신기반시설 가이드 | 컨테이너/이미지 하드닝 (C-01~C-09) | 9 |
| CIS Benchmark | DB (MySQL·PostgreSQL·Oracle·MSSQL) | 46 |
| CIS Benchmark | WAS (Tomcat·WebLogic·WebSphere) | 28 |
| CIS Benchmark | Windows 서버·IIS | 10 |

점검 룰은 Nginx, Apache, Tomcat, MySQL, PostgreSQL, Oracle, IIS, MSSQL, WebLogic, WebSphere 등 **13종 벤더 팩**으로 구현되어 있고, 새 프레임워크·벤더 추가는 JSON 데이터 파일과 레지스트리 등록만으로 가능합니다.

### 6. AI 분석 보고서 — raw 로그가 아니라 조치 가능한 문서

점검이 끝나면 항목별 판정(양호/취약/검토)과 심각도 요약이 담긴 보고서가 생성됩니다. 각 항목을 클릭하면 Claude AI가 작성한 **판정 근거 → 증거(evidence) → 조치방안 → 설정 예시**가 이어집니다. 담당자가 그대로 복사해 적용할 수 있는 수준의 구체성이 목표입니다.

![보안 점검 보고서 — 판정 요약](docs/images/report-summary.jpg)

![AI 분석 — 판정 근거, 증거, 조치방안, 설정 예시](docs/images/report-ai-analysis.jpg)

중요한 설계 원칙: **AI는 판정하지 않습니다.** 판정은 Ansible이 수집한 증거에 정적 룰을 적용해 산출하고, AI는 그 결과를 해석·설명하는 역할만 합니다(증거가 애매한 항목에 한해 AI가 양호/취약 보정 판단을 돕는 검토 단계가 있습니다). AI 입력 전에는 민감정보가 sanitize되며, `CLAUDE_ANALYSIS_ENABLED` 설정으로 AI 단계를 켜고 끌 수 있습니다. 보고서는 CSV로 내보낼 수 있고, 보고서 화면에서 바로 재점검을 실행할 수 있습니다.

### 7. 점검 이력 — 자산별 추세를 한눈에

모든 점검 실행이 자산별로 누적됩니다. 심각도 요약(심각/높음/중간/낮음), 수동/예약 트리거 구분, 소요 시간, 결과 상태를 비교하며 "지난주보다 나아졌는가"를 확인합니다.

![점검 이력](docs/images/runs.jpg)

### 8. CVE 실시간 감시 — 점검하지 않는 날에도 지켜봅니다

서버에 설치된 패키지 목록을 주기적으로 수집해 NVD와 대조하고, NVD 델타 피드를 실시간으로 수집(LIVE)해 새로 공개된 CVE 중 **우리 자산에 실제 영향이 있는 것만** 골라냅니다. 고위험(CVSS ≥ 7.0) 매칭은 Claude가 영향·조치를 한국어로 분석하고, 새 매칭이 생기면 화면에 실시간 토스트로 알립니다.

![CVE 피드 — NVD 실시간 수집](docs/images/cve-feed.jpg)

CVE 상세 화면은 영향받는 자산 목록과 배포판별 조치 가이드(apt/yum 업그레이드 명령)를 제공하며, 조치 후 해당 자산만 골라 바로 재스캔할 수 있습니다.

![CVE 상세 — 영향 자산과 조치 가이드](docs/images/cve-detail.jpg)

### 9. 프로젝트와 공유 — 결과가 필요한 사람에게 안전하게

자산을 프로젝트로 묶고 담당 PM 연락처를 등록합니다. 프로젝트 화면에서 **공유 링크**를 발급하면, PM은 계정 없이 링크+비밀번호만으로 자기 프로젝트의 종합 보안 점수 게이지와 자산별 풀 리포트를 읽기 전용으로 열람합니다. 모바일 전달용 QR 코드도 즉석에서 생성됩니다.

![프로젝트 상세 — 일괄 점검과 공유 설정](docs/images/project-share.jpg)

공유 비밀번호는 5회 실패 시 15분 잠금으로 보호되고, 링크는 언제든 폐기·재발급할 수 있습니다.

![공유 뷰 — 비밀번호 보호](docs/images/share-gate.jpg)

### 10. 처음 써도 헤매지 않게

첫 로그인 시 자산 등록 → 점검 → 진행 확인 → 분석 보고서 → AI 분석 → 실시간 CVE 대응 → 공유로 이어지는 9단계 온보딩 투어가 자동으로 시작됩니다. 다크 모드도 지원합니다.

| 온보딩 투어 | 다크 모드 |
|---|---|
| ![온보딩 투어](docs/images/onboarding-tour.jpg) | ![다크 모드 대시보드](docs/images/dashboard-dark.jpg) |

---

## 동작 구조

```mermaid
flowchart LR
    subgraph 자산등록["자산 등록"]
        A[서버 자산<br/>SSH 접속정보] 
        B[레포 자산<br/>GitHub URL]
    end
    subgraph 점검["점검 파이프라인"]
        A --> C[SSH 연결 → Ansible 점검]
        B --> D[클론 → 빌드 → 샌드박스 → Ansible 점검]
        C --> E[룰 평가<br/>KISA·CIS 186항목]
        D --> E
        E --> F[Claude AI 분석<br/>근거·조치방안·설정 예시]
    end
    subgraph 상시감시["상시 감시"]
        G[정기 점검 스케줄러] --> C
        H[NVD CVE 감시] --> I[자산 패키지 대조<br/>+ AI 영향 분석]
    end
    F --> J[대시보드 · 보고서 · 점검 이력]
    I --> J
    J --> K[PM 공유 링크<br/>비밀번호 + QR]
```

점검 결과는 다섯 가지 상태로 판정됩니다.

| 상태 | UI 표시 | 의미 |
|---|---|---|
| `pass` | 양호 | 명확한 증거로 기준을 만족 |
| `fail` | 취약 | 명확한 증거로 기준을 위반 |
| `review` | 검토 | 증거 부족·환경 의존으로 수동 확인 필요 |
| `skip` | 제외/해당 없음 | 대상 파일·서비스가 없어 점검 대상 아님 |
| `not_automated` | 자동화 전 | 카탈로그엔 있으나 자동 점검 미지원 (통계 제외) |

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트/백엔드 | Next.js 16 (App Router) · React 19 · TypeScript strict |
| 데이터베이스 | SQLite (better-sqlite3) — 단일 파일, 별도 DB 서버 불필요 |
| 스타일 | Tailwind CSS v4 · Kinetic Security System 디자인 토큰 (라이트/다크) |
| 점검 엔진 | Ansible playbook (SSH: paramiko/ssh 커넥션) · Docker CLI (샌드박스) |
| AI | Claude API (`@anthropic-ai/sdk`) · zod 응답 스키마 검증 |
| 외부 연동 | NVD API (CVE) · GitHub (레포 클론) · xlsx (엑셀 업로드/템플릿) |
| 백그라운드 | in-process 스케줄러 + CVE 폴러 (`instrumentation.ts` 기동, 외부 큐 불필요) |
| 테스트 | Vitest — **1,119개 테스트 통과** |

인터넷이 차단된 온프레미스 환경을 전제로 설계되어, 담당자 노트북 한 대에서 전체가 동작합니다(외부 의존은 Claude API·NVD API뿐이며 둘 다 꺼도 점검 자체는 동작).

---

## 시작하기

### 요구사항

- Node.js 20+
- `ansible-playbook` CLI (서버/컨테이너 점검 실행)
- Docker CLI (레포·컨테이너 점검 시)
- 점검 대상 서버로의 SSH 접근 (포트는 자산별 설정)

### 설치와 실행

```bash
git clone https://github.com/BoB-Compright/e-Prowler-mvp.git
cd e-Prowler-mvp
npm install

# 환경 변수 설정
cp .env.example .env
```

`.env`에서 다음 값을 설정합니다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `INFRA_SECURITY_MASTER_KEY` | ✅ | SSH 자격증명 암호화용 AES-256 키 (base64 32바이트) |
| `AUTH_ADMIN_USERNAME` / `AUTH_ADMIN_PASSWORD` | ✅(최초 1회) | 최초 기동 시 관리자 계정 자동 생성 (계정이 이미 있으면 무시) |
| `ANTHROPIC_API_KEY` | AI 사용 시 | Claude API 키 |
| `CLAUDE_ANALYSIS_ENABLED` | 선택 | AI 분석 단계 on/off (기본 false — 토큰 절약) |
| `NVD_API_KEY` | 선택 | NVD API 키 (없으면 무키 레이트리밋으로 동작) |
| `DATABASE_PATH` | 선택 | SQLite 파일 경로 (기본 `./data/app.db`) |

암호화 키 생성:

```bash
python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

실행:

```bash
# 개발
npm run dev

# 프로덕션
npm run build
npm run start
```

http://localhost:3000 접속 → `/login`에서 관리자 계정으로 로그인하면 온보딩 투어가 시작됩니다. 공유 링크(`/share/[token]`)를 제외한 모든 화면과 API는 로그인이 필요합니다.

테스트:

```bash
npm test   # Vitest — 1,119 tests
```

---

## 보안 설계

- **자격증명 보호**: SSH 비밀번호·키는 AES-256-GCM 암호화 저장. API 응답·로그·AI 입력에 평문 노출 금지. SSH 키는 점검 시에만 0600 임시파일로 복호화되고 실행 직후 삭제
- **인증**: 로컬 계정 + 세션 (scrypt 비밀번호 해시). 설계 근거는 [ADR-0001](docs/adr/0001-authentication-local-accounts.md)
- **공유 링크**: 비밀번호 보호 + 5회 실패 시 15분 잠금 + 영구 폐기/재발급
- **AI 입력 sanitize**: 점검 증거를 Claude에 보내기 전 민감정보 제거
- **리소스 안전장치**: 샌드박스 10분 수명 제한, 일회용 빌드 이미지 자동 삭제, 진행 중 점검이 있는 자산 삭제 차단

---

## 문서

- [PRD v3 (통합 제품 명세)](PRD-v3-integrated.md) — 현행 기능 전체의 상세 명세
- [DESIGN.md](DESIGN.md) — Kinetic Security System 디자인 시스템
- [docs/adr/](docs/adr/) — 아키텍처 결정 기록
- [docs/superpowers/specs/](docs/superpowers/specs/) — 기능별 설계 문서 (40여 편)

---

## 상태

BoB 해커톤 출품작 (2026-07). 내부 전용 도구 — 라이선스 미정의.
