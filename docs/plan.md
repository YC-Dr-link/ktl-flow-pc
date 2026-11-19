# M4·M5 진행 계획

갱신: 2026-10-22 (Delivery Manager)

## 상태

초록. 디자인 v2(한 화면 작업대) 적용·점검이 라운드 2에서 P0/P1 0건으로 끝났다(planning/ROUNDS.md). Reality Checker 조건부(5070d0f), god 최종 검수로 v0.2.0-proto(태그 01b22ee)가 내부 시연용으로 승인되었다. 외부 배포·정식 사용은 미승인이다.

## 마일스톤

| 마일스톤 | 상태 | 근거 |
| --- | --- | --- |
| 1단계 계산 코어(M4) | 완료 | 144388a, QA_stage1.md |
| 2단계 Excel 생성(M5) | 완료 | 89cff97, QA_stage2.md |
| 3단계 화면(UI) | 완료 | QA_stage3.md |
| 보안 점검·수정 | 완료 | SECURITY_REVIEW.md, REVIEW_security_fixes.md |
| 출시 전 점검 루프 | 완료 | planning/ROUNDS.md (기능·UX·UI 각 라운드 1) |
| 문서 갱신(README·RELEASE_NOTES 숫자) | 완료 | f8fa9e0 |
| 최종 재판정, 판정서 | 완료 | REALITY_CHECK.md 535e63c(조건부), docs/release/verdict.md 1334e69 |
| 최종 검수, 태그 v0.1.0-proto | 완료(조건부) | god 승인: 내부 시연용만. 태그는 내부용, push·외부 전송은 사람 승인 필요 |
| 백로그(CWS-95·78·81), 이력 정리 | 완료 | planning/ROUNDS.md. 문서 속 해시는 정리 전 값 |
| V3 화면·흐름 변경 (장비 두 묶음, 모달 3개, 저장 화면, 카드 색) | 완료(조건부) | planning/ROUNDS.md, 최종 코드 e67003a, 태그 v0.3.0-proto(10b2b83). 재판정 없음(verdict 6-2절), 내부 시연용만 |
| UI/UX Pro Max 보완 (UP-1~9) | 완료 | planning/ROUNDS.md, 최종 코드 00cac87. 재판정 없음(판정서 기준 5070d0f) |
| 디자인 v2 적용, 태그 v0.2.0-proto | 완료(조건부) | planning/ROUNDS.md, RC 5070d0f, 릴리스 01b22ee. 내부 시연용만 |

## 진행 중

- 개발·점검 쪽 열린 일 없음. 정식 사용 전 H11. 외부 공개 전 사람 결정: 작성자·메일, 원본 xlsx 외부 링크 경로, 견본 기관명.

## 막힌 것

없음.

## 사람 결정·확인 (출시 전)

- 1366×768 종합판정·카드 3개는 첫 화면에 들어온다(v2, 닫힘).
- 외부 배포 전 정리: 원본 xlsx의 실제 접수 건 값, git 이력, 문서 속 이름·로컬 경로 (docs/RELEASE_NOTES.md 체크리스트).

## 위험

- 낮음: N1(페이지 이동으로 외부 전송 가능, 오염된 의존성 전제), 접근성 P3 A7~A13, e2e 배치 허용치가 빠듯해 다른 PC 글꼴에서 깨질 수 있음.
- 시연 뒤 수정 가능성: 사람 결정 6건은 모두 A로 진행, 시연 뒤 바뀔 수 있다. S4(compute.js:45), S6(compute.js:159)은 코드에 박혀 있어 답이 바뀌면 Backend 수정이 필요하다.
- 에이전트 운영: 일부 에이전트가 토큰 한도에 걸려 검토 범위를 줄였다(UI 단계 코드 검토).

## 백로그 (출시 후)

접근성 B2~B5, CR P3(Tab 순서·금지어 해시 속성 값 등), check-dist 지시문 고정, 이름 정리 규칙 중복 통합(UI와 excel/buildXlsx.js). U8은 PO 의견으로 제외.
