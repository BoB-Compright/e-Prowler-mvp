# Issue #10: Ansible 플레이북 동적 생성 (스토리 #17~27)

**Label:** ready-for-agent  
**Blocked by:** #8, #9 (자산 저장 및 조회)

## What to build

자산 데이터베이스의 서버 정보로부터 Ansible 플레이북과 인벤토리를 동적으로 생성합니다.

**생성 대상:**
- Ansible inventory 파일 (INI 형식): 호스트, SSH 포트, 사용자, 비밀번호/키 경로
- Ansible playbook (YAML): 다음 정보를 수집하는 태스크

**수집 항목:**
- OS 버전 및 커널 버전 (uname, lsb_release)
- CPU, 메모리, 디스크 정보 (lscpu, free, df)
- 호스트명과 IP 설정 (hostname, ip addr)
- 설치된 패키지 목록과 버전 (dpkg -l / rpm -qa)
- 주요 서비스와 상태 (systemctl list-units)
- 방화벽 규칙 (ufw status / iptables -L)
- SSH 설정값 (/etc/ssh/sshd_config 주요 항목)
- 사용자 권한 설정 (/etc/sudoers)
- SELinux 상태 (getenforce)

**민감 정보 마스킹:**
- 수집된 정보에서 비밀번호, API 키, 개인키 등을 `****`으로 마스킹

**출력:**
- `/tmp/ansible_inventory_<timestamp>` 인벤토리 파일
- `/tmp/ansible_playbook_<timestamp>.yml` 플레이북 파일

## Acceptance criteria

- [ ] 자산 데이터로부터 Ansible 인벤토리 파일 생성됨
- [ ] Ansible 플레이북이 위 9가지 정보를 모두 수집하도록 작성됨
- [ ] 수집 결과가 JSON 형식으로 마스킹됨
- [ ] 비밀번호/키 정보가 `****`으로 마스킹되어 저장됨
- [ ] 테스트: 단일 자산, 여러 자산, SSH 키 기반 인증
