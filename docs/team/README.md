# 팀 공동개발 자료 (참고용)

> **참고 자료다. 구현 기준은 이 저장소의 기존 문서(`docs/SPEC.md`·`docs/CALCULATION.md`·`docs/EXCEL_MAPPING.md`)다. 팀 기준과 다른 곳은 고르지 않고 [GAP.md](GAP.md)에 적었다.** 무엇을 따를지는 사람이 정한다.

- 원문: [source/](source/)에 원문 18개를 그대로 미러했다(수정 금지). 저장소·경로·커밋 SHA·다시 받는 명령은 [source/SOURCES.md](source/SOURCES.md)에 있다. 받은 날짜는 2026-10-29다.
- 배경: 캡스톤 조직 YC-Dr-link의 과제 A 중 A-2 「실험 PC 도구」(팀 저장소 ktl-flow-pc)가 이 저장소의 M4·M5 도구에 해당한다.

## A-2 관련 위치 색인

| 찾는 것 | 파일 · 위치 |
|---|---|
| 우선순위 M/S/C 뜻과 마감 | [source/ktl-hub/docs/01-요구사항명세.md](source/ktl-hub/docs/01-요구사항명세.md) §0 (7행) |
| 공통 요구 REQ-COM-01~08 (오프라인, 실데이터 금지, SHA-256, 확인 후 확정, 출처, 내용 판별) | 01 §1 (27행) |
| **A-2 요구 REQ-A2-01~10** | 01 §3 (57행) |
| 비기능 NFR (언어·테스트·cp949) | 01 §8 (143행) |
| 확인 필요·임시 결정 (직선성 정의, 성적서 양식, 반출) | 01 §9 (154행) |
| **QR 스키마·체크값·자모 복원** | [source/ktl-hub/docs/02-API명세.md](source/ktl-hub/docs/02-API명세.md) §4 (330행) |
| QR 테스트 벡터 5개 (valid 3, invalid 2) | [qr-test-vectors.json](source/ktl-hub/docs/contracts/qr-test-vectors.json) |
| **통일 Excel 시트·행·파일명·계산식** | 02 §5 (354행) |
| 계약 변경 절차 | 02 머리말 (1~15행) |
| PI-05 QR 표시 (전달 방식 확인 필요) | [source/ktl-hub/docs/03-UI시나리오.md](source/ktl-hub/docs/03-UI시나리오.md) A-5 (97행) |
| **PC-01~04 화면 흐름과 예외 7가지** | 03 A-7 (112행) |
| 화면 목록·공통 규칙 (색 의미, 대기, 오프라인) | 03 화면 목록 (8행) · 화면 공통 규칙 (303행) |
| A-2 역할·제출물·추천 형태(Python exe)·분담 제안 | [source/ktl-hub/docs/04-역할분담.md](source/ktl-hub/docs/04-역할분담.md) §2 A-2 (34행), 파트 연결 지도 §3 (88행) |
| 이슈·브랜치·커밋·PR·병합 규칙 | [source/ktl-hub/docs/05-협업규칙.md](source/ktl-hub/docs/05-협업규칙.md) §2 (18행) · §3 (42행) · §4 (55행) |
| 데이터·보안 규칙 | 05 §6 (94행) |
| **관문 일정 (10/25·11/1·11/2·11/6·11/8)과 확인 항목** | [source/ktl-hub/docs/06-일정.md](source/ktl-hub/docs/06-일정.md) 관문별 확인 항목 (42행) |
| ktl-flow-pc 첫 할 일·추천 폴더 구성 | [source/ktl-flow-pc/README.md](source/ktl-flow-pc/README.md) |
| 저장소 지도·담당 | [source/ktl-hub/README.md](source/ktl-hub/README.md) |

과제 B 파일(OpenAPI, ktl-field-* README, categories.yaml, ktl_contract)은 A-2와 직접 관계가 없다. 사용자 결정으로 전체를 미러했기 때문에 함께 들어 있다.

## 미러에 없는 팀 정보 (2026-10-29 gh 조회)

ktl-flow-pc의 `AGENTS.md`(@f1ff030)는 미러 목록에 없어 요점만 적는다. 코딩 Agent도 이슈 하나만 작업한다. 커밋·PR에 AI 서명 줄(Co-Authored-By 등)을 넣지 않는다. 계약과 다르게 해야 하면 멈추고 사람에게 보고한다. 문서에 없는 KTL 사실은 `TODO(확인 필요)`로 남긴다. 테스트는 pytest와 합성 CSV(`synthetic/`)로 한다.

ktl-flow-pc 이슈는 모두 열려 있다.

| # | 제목 | 우선 | 관문 |
|---|---|---|---|
| 1 | 형태 결정 (파이썬/단일 HTML) + 실행 뼈대 | 필수 | 1 (10/25) |
| 2 | 합성 풍동 CSV 6개 생성기 | 필수 | 1 |
| 3 | QR 입력·체크값·한글 자모→영문 | 필수 | 2 (11/1) |
| 4 | CSV 읽기·종류 판별 | 필수 | 2 |
| 5 | 반복성·직선성(2가지)·민감도 계산 | 필수 | 2 |
| 6 | PC-01~04 화면 흐름 | 필수 | 3 (11/6) |
| 7 | 통일 Excel 출력 + 출처 시트(SHA-256) | 필수 | 3 |
| 8 | (S) QR ↔ CSV 1~6행 교차 확인 | 권장 | 3 |
| 9 | (S) 민감도 그래프 2개 | 권장 | 3 |
| 10 | (S) 설치 없이 실행 (exe 하나) | 권장 | 3 |

- 이 저장소 사용자에게 배정된 이슈는 #1·3·4·6·8·10이다.
- #1은 완료 칸만 체크되어 있다. 결정 댓글과 실행 뼈대 PR은 보이지 않는다.
- #3은 「테스트 벡터 전부」 칸이 아직 체크되지 않았다.
- ktl-hub #1(문서 확인)과 #6(통합 리허설 11/8)도 배정되어 있다. ktl-hub #3(과제 A 연구원 질문)에는 아직 답이 없다.
