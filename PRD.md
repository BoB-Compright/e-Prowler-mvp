# PRD: AI-Powered Infrastructure Security Scanning Tool (MVP)

**Version:** 2.0  
**Date:** 2026-06-24  
**Status:** Ready for Development  
**Team:** 3 junior developers  
**Timeline:** 20 days (actual available time: 10-12 days)

---

## Problem Statement

Security teams managing large-scale infrastructure (IDC-level, hundreds to thousands of servers) face critical challenges:

1. **Manual vulnerability assessment** — Infrastructure security checks are performed manually, consuming significant time and resources
2. **CVE monitoring bottleneck** — Keeping up with daily CVE updates across the entire server fleet is impractical without automation
3. **Inefficient large-scale operations** — Traditional scan-and-report workflows don't scale to IDC-level deployments
4. **No centralized visibility** — Security teams lack a unified view of vulnerabilities across the fleet and cannot quickly correlate CVE impacts

This results in delayed vulnerability identification, increased risk exposure, and manual overhead in security operations.

---

## Solution

An AI-powered infrastructure security scanning tool that:

1. **Automates OS information collection** — Automatically extracts detailed OS, package, and security configuration data from Linux servers via Ansible/SSH
2. **Analyzes vulnerabilities with AI** — Uses Claude API to intelligently analyze extracted information, identify vulnerabilities, and suggest remediation (in Korean)
3. **Matches CVE data** — Correlates collected OS/package information with NVD CVE database to identify applicable vulnerabilities on each server
4. **Provides unified visibility** — Presents vulnerabilities via a web dashboard with severity filtering, server-impact analysis, and remediation guidance

The MVP focuses on the core "spine" (3 critical user stories) to validate the approach within 20 days with a junior team.

---

## User Stories

### Asset Management

1. As a Security Engineer, I want to import a CSV file containing server IP, hostname, OS type, and credentials, so that I can quickly populate the scanning system with my infrastructure inventory
2. As a Security Engineer, I want to upload an Excel (.xlsx) file with the same asset data, so that I can use my existing asset tracking spreadsheets
3. As a Security Engineer, I want to upload a JSON file with asset definitions, so that I can integrate with my infrastructure-as-code tools
4. As a System Admin, I want to see which rows from my upload failed and why, so that I can fix data quality issues
5. As a System Admin, I want to see a summary of the upload result (N successfully imported, M failed), so that I can verify the import worked correctly
6. As a Security Engineer, I want to add a server manually in the dashboard, so that I can update inventory without re-uploading files
7. As a Security Engineer, I want to edit an existing server's details (IP, hostname, credentials), so that I can keep my inventory up to date
8. As a Security Engineer, I want to delete a server from the inventory, so that I can remove decommissioned systems
9. As a Security Engineer, I want to view all servers in the system with their IP, hostname, OS type, and last scan timestamp, so that I can monitor scan coverage
10. As a Security Engineer, I want to see the status of each server (Normal/Warning/Risk) at a glance, so that I can prioritize which ones need attention

### Credential Security & Authentication

11. As a System Admin, I want passwords and SSH private keys to be stored in encrypted form (AES-256), so that credentials are protected at rest
12. As a System Admin, I want the encryption key to be loaded from an environment variable (INFRA_SECURITY_MASTER_KEY), so that I can manage keys securely outside the application
13. As a Security Engineer, I want credentials to be decrypted only during active scans, so that they're not exposed in logs or UI
14. As a System Admin, I want only Admin users to view encrypted credentials (even in encrypted form), so that access is properly controlled
15. As a user, I want a secure login page (username/password) to authenticate to the system, so that unauthorized people cannot access vulnerability data
16. As an Admin, I want to create and manage user accounts, so that I can control who has access

### OS Information Collection (Core MVP Feature)

17. As a Security Engineer, I want to scan Linux servers (5-10 initially) via Ansible/SSH on port 22, so that I can collect infrastructure baselines
18. As a Security Engineer, I want the system to collect OS version and kernel version information, so that I can identify outdated base systems
19. As a Security Engineer, I want the system to collect CPU, memory, and disk information, so that I can correlate capacity with vulnerability risks
20. As a Security Engineer, I want the system to collect the hostname and IP configuration, so that I can understand the network topology
21. As a Security Engineer, I want the system to extract the complete list of installed packages and their versions, so that I can match against CVE databases
22. As a Security Engineer, I want the system to identify major services and their running status, so that I can understand the attack surface
23. As a Security Engineer, I want the system to extract firewall rules and status, so that I can understand network segmentation
24. As a Security Engineer, I want the system to extract SSH configuration, so that I can audit access controls
25. As a Security Engineer, I want the system to extract user permission settings, so that I can identify privilege escalation risks
26. As a Security Engineer, I want the system to check SELinux status, so that I can understand the security module configuration
27. As a Security Engineer, I want sensitive data (passwords, API keys, private keys) to be masked with **** before storage, so that sensitive info is not exposed
28. As a Security Engineer, I want to scan up to 10 servers in parallel, so that collection completes quickly
29. As a Security Engineer, I want failed server scans to be retried up to 3 times with 30-second intervals, so that transient network issues don't block the scan
30. As a Security Engineer, I want failed servers to be skipped gracefully so that I can scan the rest of the fleet
31. As a Security Engineer, I want each server scan to timeout after 5 minutes, so that hung connections don't block the entire job
32. As a Security Engineer, I want detailed logs of which servers succeeded and failed, so that I can troubleshoot collection issues

### AI-Based Vulnerability Analysis (Core MVP Feature)

33. As a Security Engineer, I want the system to analyze collected OS information using Claude API, so that I can identify vulnerabilities using AI reasoning
34. As a Security Engineer, I want vulnerabilities to be classified by CVSS severity (Critical, High, Medium, Low) based on CVSS v3.1 scores, so that I can prioritize remediation
35. As a Security Engineer, I want the AI analysis to explain the root cause in Korean, so that my team can understand the technical details
36. As a Security Engineer, I want the AI to provide remediation steps in Korean, so that my team can act on the findings
37. As a Security Engineer, I want AI analysis results to include affected servers, so that I know which systems need attention
38. As a Security Engineer, I want each vulnerability to include a remediation priority score, so that I can efficiently allocate resources
39. As a Security Engineer, I want the analysis results to reference CVE IDs, so that I can look up additional context
40. As a Security Engineer, I want the system to automatically match collected packages against CVE databases, so that I identify applicable vulnerabilities

### CVE Database Integration (Core MVP Feature)

41. As a Security Engineer, I want the system to integrate with the NVD CVE API, so that I have access to current vulnerability data
42. As a Security Engineer, I want the system to automatically match my infrastructure's installed packages against the CVE database, so that I know which systems are affected
43. As a Security Engineer, I want the system to update the CVE database automatically every day (or on-demand), so that I have current threat intelligence
44. As a Security Engineer, I want the system to cache CVE data locally, so that scans work even if the NVD API is temporarily down
45. As a Security Engineer, I want to see the CVE ID, title, description, and CVSS score for each identified vulnerability

### Web Dashboard (Core MVP Feature)

46. As a Security Engineer, I want to see a KPI card showing the total number of servers, so that I understand my scan scope
47. As a Security Engineer, I want to see a KPI card showing how many servers are in Normal, Warning, or Risk status, so that I can assess fleet health at a glance
48. As a Security Engineer, I want to see a KPI card showing the count of Critical, High, Medium, and Low vulnerabilities, so that I can understand severity distribution
49. As a Security Engineer, I want to see a pie chart showing vulnerability distribution by severity, so that I can understand the risk profile visually
50. As a Security Engineer, I want to view a list of all scanned servers with their IP, hostname, OS, and last scan time, so that I can track coverage
51. As a Security Engineer, I want to click on a server to see its detailed vulnerability list, so that I can understand which issues affect that system
52. As a Security Engineer, I want to filter vulnerabilities by severity (Critical, High, Medium, Low), so that I can focus on the most urgent issues
53. As a Security Engineer, I want to view each vulnerability's CVE ID, title, severity, and CVSS score, so that I have the information needed to triage
54. As a Security Engineer, I want to view affected servers for each vulnerability, so that I know the scope of impact
55. As a Security Engineer, I want to view remediation steps in Korean, so that my team can understand how to fix the issues
56. As a Security Engineer, I want to see references to CVE details (NVD links), so that I can research vulnerabilities further
57. As a Security Engineer, I want the dashboard to auto-refresh every 1 minute, so that I see the latest scan results
58. As a Security Engineer, I want a manual refresh button on the dashboard, so that I can get the latest data on-demand
59. As an Admin user, I want to view all servers and all vulnerabilities, so that I have complete visibility
60. As a Viewer user, I want to view only servers assigned to my team/department, so that I see only relevant data

### Scan Execution & Data Flow

61. As a Security Engineer, I want to initiate a manual scan from the dashboard, so that I can control when data is collected
62. As a Security Engineer, I want to see real-time progress as servers are scanned, so that I know the scan is working
63. As a Security Engineer, I want scan results to be stored in the database, so that I have a permanent record
64. As a Security Engineer, I want each scan to have a timestamp, so that I can track when information was collected

---

## Implementation Decisions

### Technology Stack

- **Backend:** Python + FastAPI (async, high performance for parallel operations)
- **Frontend:** React (component-based, good for dashboard visualization)
- **Database:** PostgreSQL (relational schema for assets, vulnerabilities, CVE data)
- **OS Information Collection:** Ansible (orchestration) + SSH (remote execution on Linux)
- **AI Analysis:** Claude API (intelligent reasoning about vulnerabilities)
- **CVE Database:** NVD API (public, free, comprehensive)
- **Encryption:** AES-256 (credentials at rest), bcrypt (password hashing)
- **Deployment:** Docker containers or local server deployment

### Database Schema

Core entities:
- **Assets** — IP, hostname, OS type, account credentials (encrypted), last scan timestamp
- **Vulnerabilities** — CVE ID, title, severity, CVSS score, root cause (Korean), remediation (Korean), affected servers (foreign key), references
- **CVE Cache** — Local copy of CVE data from NVD API for offline matching
- **Users** — username, hashed password, role (Admin/Viewer), team assignment
- **Scan Results** — timestamp, asset ID, success/failure status, collected OS info (JSON), analysis results

### API Contracts (FastAPI)

Key endpoints:
- `POST /assets/upload` — Accept CSV/Excel/JSON file, parse, validate, store
- `GET /assets` — List all assets (with pagination)
- `POST /assets/{id}/scan` — Initiate scan for a single asset
- `POST /scan` — Initiate fleet-wide scan (parallel)
- `GET /vulnerabilities` — List vulnerabilities (with filtering, pagination)
- `GET /vulnerabilities/{cve_id}` — Get details of a specific CVE
- `GET /dashboard/metrics` — KPI metrics for dashboard
- `POST /auth/login` — User authentication
- `POST /cve/update` — Manually trigger CVE database update

### Architectural Decisions

1. **Parallel OS Collection** — Use asyncio in Python to collect from multiple servers concurrently (pool of 5-10 workers) to reduce total collection time
2. **Credential Encryption at Application Layer** — Encrypt/decrypt credentials in the app (not relying on database encryption alone) for granular control
3. **Ansible Playbook Generation** — Generate Ansible playbooks dynamically from asset data to collect OS info (simplifies updates, leverages Ansible's SSH abstraction)
4. **Async AI Analysis** — Call Claude API asynchronously after OS data collection completes, so the UI doesn't block
5. **CVE Matching Logic** — Match packages by name + version range (e.g., if CVE affects 1.1.0-1.1.1g and server has 1.1.1a, flag it)
6. **Dashboard Real-time Updates** — Use WebSocket or polling (1-min interval) to push new scan results to the frontend

### Team Role Allocation (Recommended)

- **Developer 1:** Backend (FastAPI) + Ansible orchestration (OS info collection)
- **Developer 2:** AI analysis logic (Claude API) + CVE database integration
- **Developer 3:** React frontend + dashboard + basic UI

---

## Testing Decisions

### What Makes a Good Test

- Tests should verify **external behavior**, not implementation details
- Tests should be **integration-level** where possible — testing the full data flow from asset to vulnerability report
- Tests should use real or realistic test data (e.g., actual Linux VMs if available, or mocked Ansible output that matches real Ansible behavior)
- Tests should not mock the Claude API (use a fixture with known outputs instead)

### Modules & Testing Strategy

1. **Asset Management Module**
   - Test: CSV/Excel/JSON parsing with valid and invalid data
   - Test: Credential encryption/decryption round-trip
   - Test: CRUD operations (create, read, update, delete assets)
   - Prior art: Use pytest fixtures for sample CSV/Excel files; parametrize tests for different file formats

2. **OS Collection Module (Ansible Integration)**
   - Test: Ansible playbook generation from asset data
   - Test: Parallel execution with 5-10 servers (use test VMs or Ansible mocks)
   - Test: Retry logic (simulate transient failures, verify 3 retries)
   - Test: Timeout handling (verify scan stops after 5 minutes per server)
   - Test: Sensitive data masking (verify passwords/keys are masked in results)
   - Prior art: Use ansible-test or mock Ansible runs; parametrize for success/failure scenarios

3. **AI Analysis Module**
   - Test: Claude API calls with sample OS data
   - Test: Vulnerability classification by CVSS score
   - Test: Korean language output (verify response structure, not just translations)
   - Prior art: Use fixtures for Claude API responses; mock the HTTP client

4. **CVE Matching Module**
   - Test: Package version matching logic (e.g., does "openssl 1.1.1a" match CVE for 1.1.0-1.1.1g?)
   - Test: NVD API integration (mock API responses)
   - Test: CVE cache fallback (verify system works without live API)
   - Prior art: Use pytest fixtures for CVE data; parametrize for different package/CVE scenarios

5. **API Endpoints**
   - Test: `/assets/upload` with valid/invalid files
   - Test: `/scan` endpoint (trigger full fleet scan, verify all servers queued)
   - Test: `/vulnerabilities` filtering by severity, pagination
   - Test: Authentication (valid/invalid credentials)
   - Prior art: Use FastAPI TestClient; parametrize for different input types

6. **Dashboard Data Flows**
   - Test: Dashboard KPI calculations (count servers by status, count vuln by severity)
   - Test: Vulnerability detail page (verify all required fields present)
   - Test: Filtering on client side (React tests with Vitest or Jest)
   - Prior art: Use React Testing Library for component tests

### Testing Seams

**High-level seam (preferred):** Mock at the Ansible execution layer and Claude API layer. Integration tests at the FastAPI endpoint level. This allows testing the full flow (asset → collection → analysis → storage → API response) without external dependencies.

---

## Out of Scope (MVP)

The following features are explicitly out of scope for this MVP and planned for future phases:

- **Windows Server Support** — WinRM-based Windows OS data collection
- **Scheduled Scanning** — Cron-based automated scans (MVP: manual scans only)
- **Email/Slack Alerts** — CVE notifications via email or messaging (next phase)
- **Automated Report Generation** — PDF/Excel report exports (next phase)
- **Detailed Remediation Tracking** — Assignment of remediation tasks, status tracking, re-scanning (next phase)
- **Long-term Data Archival** — Retention policies beyond immediate scan results (next phase)
- **Complex RBAC** — Multiple roles, fine-grained permissions (MVP: Admin/Viewer only)
- **Cloud Integration** — AWS, Azure, GCP connector plugins
- **Auto-Remediation** — Automatic patching or config fixes
- **ML-based Prediction** — Predictive risk scoring based on historical data
- **LDAP/AD Integration** — Directory service authentication

---

## Further Notes

1. **AI Utilization Strategy** — Claude API is used for two critical tasks: (a) analyzing collected OS data to identify potential vulnerabilities, and (b) generating human-readable, Korean-language remediation steps. This leverages AI's reasoning capabilities without requiring complex ML pipeline infrastructure.

2. **Success Criteria (Minimal for MVP)** — The MVP is deemed successful if:
   - Assets can be imported from CSV, OS info collected from 5-10 Linux servers via Ansible with >80% success rate
   - AI analysis produces severity-classified vulnerability reports with remediation steps in Korean
   - Web dashboard displays vulnerability list with basic filtering and severity distribution chart

3. **Team Skill Assumptions** — The team consists of junior developers with Python/JavaScript/React basics. Heavy reliance on Claude Code for generating Ansible playbooks and FastAPI boilerplate to accelerate development within the 20-day timeline.

4. **Security Posture** — This is an internal security tool; data is not intended for external consumption. Encryption focuses on credential protection at rest and in transit (HTTPS). No data exfiltration prevention measures (assume trusted internal network).

5. **Performance Baseline** — Initial target: scan 10 Linux servers in <5 minutes, analyze findings in <30 seconds, dashboard load in <2 seconds. Optimization is explicitly out of MVP scope.

6. **Risk Mitigation** — Biggest risk is Ansible learning curve for the team. Mitigated by: (a) 1 hour of Ansible training upfront, (b) using Claude Code to generate playbooks, (c) extensive testing with real test VMs before going to production.

---

**Ready for:** Development sprints, issue creation, architecture deep-dive
