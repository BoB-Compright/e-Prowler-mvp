# GitHub Issues Index (최신 버전)

## MVP 수직 슬라이스 (13개 이슈)

### Phase 0: 기초 인프라
- **[Issue #20](https://github.com/BoB-Compright/e-Prowler-mvp/issues/20)** - 프로젝트 부트스트랩 (FastAPI + React + SQLite)
- **[Issue #21](https://github.com/BoB-Compright/e-Prowler-mvp/issues/21)** - 데이터베이스 스키마 설계 (SQLite + 자동 백업)

### Phase 1: 자산 관리
- **[Issue #22](https://github.com/BoB-Compright/e-Prowler-mvp/issues/22)** - CSV 자산 업로드 & 저장
- **[Issue #23](https://github.com/BoB-Compright/e-Prowler-mvp/issues/23)** - 자산 목록 조회 API

### Phase 2: OS 정보 수집
- **[Issue #24](https://github.com/BoB-Compright/e-Prowler-mvp/issues/24)** - Ansible 플레이북 동적 생성
- **[Issue #25](https://github.com/BoB-Compright/e-Prowler-mvp/issues/25)** - OS 정보 수집 실행
- **[Issue #26](https://github.com/BoB-Compright/e-Prowler-mvp/issues/26)** - 스캔 진행 상황 API

### Phase 3: AI 분석 & CVE 매칭
- **[Issue #27](https://github.com/BoB-Compright/e-Prowler-mvp/issues/27)** - Claude API 취약점 분석
- **[Issue #28](https://github.com/BoB-Compright/e-Prowler-mvp/issues/28)** - NVD CVE 데이터 캐싱
- **[Issue #29](https://github.com/BoB-Compright/e-Prowler-mvp/issues/29)** - 패키지-CVE 매칭

### Phase 4: 웹 대시보드
- **[Issue #30](https://github.com/BoB-Compright/e-Prowler-mvp/issues/30)** - 대시보드 KPI 표시
- **[Issue #31](https://github.com/BoB-Compright/e-Prowler-mvp/issues/31)** - 취약점 목록 페이지
- **[Issue #32](https://github.com/BoB-Compright/e-Prowler-mvp/issues/32)** - 서버 상세 페이지

---

**⚠️ 이슈 번호 변경 이력:**
- 기존 Issue #6~#18 → 폐기됨 (2026-06-24)
- 새로운 Issue #20~#32 → 최신 버전 (깨끗한 상태, 댓글 혼동 제거)

## 의존성 그래프

```
#6 (부트스트랩) - 즉시 시작
 ├─ #7 (DB 스키마) - #6 완료 후
 │  ├─ #8 (CSV 업로드) - #7 완료 후
 │  │  └─ #10 (Ansible) - #8 완료 후
 │  │      └─ #11 (OS 수집) - #10 완료 후
 │  │           ├─ #12 (스캔 상태) - #11 완료 후
 │  │           └─ #13 (AI 분석) - #11 완료 후
 │  │                └─ #15 (CVE 매칭) - #13, #14 완료 후
 │  │                     └─ #16 (KPI) - #15 완료 후
 │  │                           └─ #17 (취약점 목록) - #16 완료 후
 │  │                                 └─ #18 (서버 상세) - #17 완료 후
 │  │
 │  ├─ #9 (자산 조회) - #7 완료 후
 │  └─ #14 (NVD 캐싱) - #7 완료 후
```

## 개발 전략 (3명, 20일)

**권장 병렬 작업:**
- **개발자 1 (백엔드 - Ansible/수집):** #6 → #7, #8, #9, #10, #11, #12 (Docker Desktop + SQLite)
- **개발자 2 (백엔드 - AI/CVE):** #13, #14, #15 (SQLite 기반)
- **개발자 3 (프론트엔드):** #6 (완료 후) → #16, #17, #18 (1분 폴링 기반)

**크리티컬 패스:** #6 (SQLite 환경) → #7 → #11 (5개 워커) → #13 → #16 (~10일)

**개발 환경 주의사항:**
- Docker Desktop에서 SQLite 파일 기반 DB 실행 (컨테이너 간 볼륨 공유 확인)
- 병렬도 5개로 제한 (노트북 리소스, CPU/메모리 모니터링 필요)
- 성능 기준: 5대 서버 스캔 <5분, 대시보드 로드 <2초

## 스토리 매핑

| PRD 스토리 | 이슈 |
|----------|------|
| #1~10 (자산 관리) | #8, #9 |
| #17~32 (OS 수집) | #10, #11, #12 |
| #33~40 (AI 분석) | #13 |
| #41~45 (CVE 데이터) | #14, #15 |
| #46~58 (대시보드) | #16, #17, #18 |

---

**생성일:** 2026-06-24
**상태:** 모든 이슈 GitHub에 발행됨 (ready-for-agent 라벨)
