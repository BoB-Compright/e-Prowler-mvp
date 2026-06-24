# GitHub Issues Index

## MVP 수직 슬라이스 (13개 이슈)

### Phase 0: 기초 인프라
- [Issue #6](./issue-6-project-bootstrap.md) - 프로젝트 부트스트랩 (FastAPI + React + PostgreSQL)
- [Issue #7](./issue-7-database-schema.md) - 데이터베이스 스키마 설계 및 마이그레이션

### Phase 1: 자산 관리
- [Issue #8](./issue-8-csv-asset-upload.md) - CSV 자산 업로드 & 저장
- [Issue #9](./issue-9-asset-list-api.md) - 자산 목록 조회 API

### Phase 2: OS 정보 수집
- [Issue #10](./issue-10-ansible-playbook.md) - Ansible 플레이북 동적 생성
- [Issue #11](./issue-11-os-collection.md) - OS 정보 수집 실행
- [Issue #12](./issue-12-scan-status-api.md) - 스캔 진행 상황 API

### Phase 3: AI 분석 & CVE 매칭
- [Issue #13](./issue-13-claude-analysis.md) - Claude API 취약점 분석
- [Issue #14](./issue-14-nvd-caching.md) - NVD CVE 데이터 캐싱
- [Issue #15](./issue-15-cve-matching.md) - 패키지-CVE 매칭

### Phase 4: 웹 대시보드
- [Issue #16](./issue-16-dashboard-kpi.md) - 대시보드 KPI 표시
- [Issue #17](./issue-17-vulnerability-list.md) - 취약점 목록 페이지
- [Issue #18](./issue-18-server-detail.md) - 서버 상세 페이지

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
- **개발자 1 (백엔드 - Ansible/수집):** #6 → #7, #8, #9, #10, #11, #12
- **개발자 2 (백엔드 - AI/CVE):** #13, #14, #15
- **개발자 3 (프론트엔드):** #6 (완료 후) → #16, #17, #18

**크리티컬 패스:** #6 → #7 → #11 → #13 → #16 (~10일)

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
