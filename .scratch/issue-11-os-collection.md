# Issue #11: OS 정보 수집 실행 (스토리 #28~#32)

**Label:** ready-for-agent  
**Blocked by:** #10 (Ansible 플레이북 생성)

## What to build

Ansible 플레이북을 실행하여 Linux 서버들로부터 OS 정보를 수집하고 데이터베이스에 저장합니다.

**엔드포인트:** `POST /scan`

**처리 로직:**
1. 데이터베이스(SQLite)에서 모든 활성 자산 로드
2. Ansible 플레이북 생성 (#10)
3. Python asyncio로 최대 5개 워커 병렬 실행 (담당자 노트북 리소스 고려)
4. 각 서버당 5분 타임아웃 설정
5. 일시적 오류 시 30초 간격으로 최대 3회 재시도
6. 부분 실패 허용 (일부 서버 실패해도 나머지는 계속 진행)
7. 결과를 SQLite `scan_results` 테이블에 저장

**응답:**
```json
{
  "scan_id": "scan-20260624-153000",
  "status": "in_progress",
  "total_servers": 10,
  "completed": 0,
  "in_progress": 10
}
```

**최종 결과 저장:**
- scan_results 테이블에 {asset_id, scan_id, status: success/failed, collected_data: JSON}

## Acceptance criteria

- [ ] `POST /scan` 엔드포인트 구현됨
- [ ] 최대 5개 서버 동시 스캔 가능 (asyncio 워커 풀, 노트북 리소스)
- [ ] 스캔 타임아웃: 5분
- [ ] 재시도 로직: 30초 간격 최대 3회
- [ ] 부분 실패 처리: 일부 실패해도 나머지는 계속 진행
- [ ] 성공/실패 결과가 SQLite scan_results 테이블에 저장됨
- [ ] 테스트: 모든 서버 성공, 일부 실패, 모두 실패, 타임아웃 시뮬레이션
- [ ] 5개 서버 스캔이 5분 이내에 완료됨
