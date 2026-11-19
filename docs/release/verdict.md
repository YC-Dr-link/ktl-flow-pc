# 릴리스 판정서: v0.2.0-proto

작성 2026-10-21 · Release Manager. 기준 HEAD `5070d0f` (main). 마지막 코드 변경은 `e995590`이고 그 뒤 커밋은 문서만이다. 한 화면 작업대(v2)로 바꾼 릴리스 후보다. 이전 판정(v0.1.0-proto, 3단계 화면)은 git 이력에 있다 (`1334e69`, `9c7109b`).

## 결론

**조건부.** 막을 결함(P0·P1)은 0건이다. 이 화면(v2)으로 사내 시연용 프로토타입을 내보내는 데 사람의 최종 승인을 청한다. 외부 배포와 정식 사용은 승인 대상이 아니다.

판정 기준 조건 (Reality Checker v2 재판정 `5070d0f`):
- P2-1 (README·RELEASE_NOTES가 v1 숫자·화면 설명): **`01b22ee`에서 닫았다.** README는 한 화면 흐름과 347,487 bytes·116개로, RELEASE_NOTES는 v2 변경·수치로 고쳤다.
- P2-2 (H5~H7 통과 기록 `0eb7aa2`가 v2 코드보다 먼저, v1 파일 기준): **닫힘.** 사람이 실험 PC에서 v2 `m4m5.html`로 H5~H7을 다시 확인해 통과했다 (2026-10-21, `0876f76`의 `planning/HUMAN_CHECKS.md`·`planning/REALITY_CHECK.md` P2-2 기록).
- H11 (연구원님 계산 검산): 정식 사용 전 필수.
- CWS-45: 원본 xlsx를 HEAD에서는 뺐고 git 이력에만 남아 있다. 외부 배포 전에 이력 정리.

태그 `v0.2.0-proto`를 제안한다 (아래 6절). 로컬 태그만 만들고 push·외부 전송은 하지 않았다 (원격 저장소 없음).

## 1. 최종 판정 (Reality Checker v2, 대상 `e995590`, 커밋 `5070d0f`)

`planning/REALITY_CHECK.md`의 「v2 재판정」 절: 조건부. P0 0 · P1 0 · P2 2 · P3 3. 필수(Must) 기능 15/15 PASS (FR-M4-11 포함), 선택 FR-M5-05 PASS. SPEC 수락 기준 FR-M4-11 AC-1~9, FR-M5-05·06 모두 PASS. 종합판정이 1366×768 첫 화면 안에 들어와 v1의 P3(첫 화면 아래)와 그 사람 결정 항목이 닫혔다. 계산·Excel은 바뀐 줄 0이라 이전 Excel 16 확인(복구 경고 없음, 인쇄 설정 원본과 같음, 535칸 중 531칸 원본 수식과 일치)이 유효하다. 화면에서 내려받은 파일 6개는 `sample.xlsx`와 zip 20항목 내용 차이 0이다.

## 2. 이 판정서를 쓰기 전 내가 직접 실행한 확인 (HEAD `5070d0f`, 깨끗한 clone)

| 명령 | 결과 |
| --- | --- |
| `git diff --stat e995590..HEAD -- src scripts tests templates package.json` | 변경 0 (코드 동일) |
| `npm ci` | 취약점 0 |
| `npm run build` | `dist/m4m5.html` 347,487 bytes |
| `npm run check-dist` | 외부 URL 0건, 통과 |
| `npm test` | tests 174, pass 174, fail 0, skipped 0 |
| `npm run e2e` | 116 passed (Chrome·Edge, `file://`, 1.8m) |
| `npm run sample` | `dist/sample.xlsx` 36,406 bytes |

Reality Checker가 같은 값을 얻었다 (347,487 / 174 / 116 / 36,406). `m4m5.html`을 playwright-cli로 직접 열어 보는 일은 하지 않았고, Reality Checker의 playwright-cli(Edge, `file://`, 1366×768) 확인과 e2e 116개로 갈음한다.

## 3. 점검 요약

| 점검 | 결과 | 커밋 |
| --- | --- | --- |
| Code Reviewer v2 R2 | 승인, P0~P3 0 | `64c5d81` |
| QA 회귀 (`e995590`) | P0~P3 0건, test 174, e2e 116, 347,487 B, sample 2,465칸 차이 0 | `a0fd64d` |
| 접근성 v2 R2 | 새 지적 0, 이월 P3 (B2~B5·A8·A11~A13) | `257cd8c` |
| 보안 | 새 지적 0 (확인은 `59ce237`까지). 그 뒤 변경은 `slots.js` 4줄·CSS 3줄이라 영향 없음, check-dist 통과·외부 요청 0 | `24dbfef`, `3462d81` |
| Reality Checker v2 | 조건부, P0 0 · P1 0 · P2 2 · P3 3 | `5070d0f` |

열린 지적 (P2-1은 이 커밋에서 닫음):

| ID | 심각도 | 내용 | 처리 |
| --- | --- | --- | --- |
| P2-2 | P2 | H5~H7이 v1 파일 기준 | **닫힘** (v2 파일로 재확인 통과, 사람, 2026-10-21) |
| P3-1 | P3 | 보안 N1 (페이지 이동 유출, 알려진 낮음, 오염된 의존성 전제) | 백로그 |
| P3-2 | P3 | 390 px에서 화면 문구가 「왼쪽」·「오른쪽」 방향 말을 씀 | **해소** (`93937af`, AC-6·AC-10, Code Reviewer 승인·QA 확인) |
| P3-3 | P3 | 선택 입력 오류가 있어도 제목을 눌러 접을 수 있음 (SPEC 문장이 둘로 읽힘) | **해소** (SPEC AC-11 확정, `93937af`: 새 오류가 생기면 영역이 열림) |

## 4. 열린 사람 결정·확인

| # | 항목 | 언제 |
| --- | --- | --- |
| H5~H7 | 실험 PC 더블클릭, 인터넷 없이 견본 → 저장, 다운로드 | **통과** (v2 파일, 사람, 2026-10-21) |
| H1~H4 | Excel 열기·병합 서식·그래프 점 5개 눈 확인·저장 후 다시 열기 (출력은 v1과 같음) | 시연 전 |
| H10 | 인쇄 미리보기 눈 확인 | 시연 전 |
| 시안 비교 | `design/mockup-toss-v2.html`과 화면 눈 비교 | 시연 전 |
| NVDA, 고대비 | 화면 낭독 순서, Windows 고대비 모드 | 시연 전 |
| H8, H9 | 실제 노트북·넓은 모니터 사용성, 실험 PC 성능 (결과 2초, Excel 3초; 개발 PC는 결과 50~60 ms, 저장 70~90 ms) | 시연 때 |
| H11 | 연구원님 계산 검산 (Q1 직선성 MAX/평균, Q2 반올림 전 값 판정). 자동 시험과 QA 재계산은 같은 문서 수식을 따른 것이라 수식 자체의 정답은 증명하지 못한다 | **정식 사용 전 필수** |
| 결정 | P3-2·P3-3 문구 확정 | 해소 (위 3절) |
| 결정 | 외부 배포: RELEASE_NOTES 체크리스트 5건과 CWS-45 | 외부 배포 때 |

시연 후 바뀔 수 있는 결정은 `planning/HUMAN_CHECKS.md` 가절(S4·S5·S6·S10·S11·S12)에 있다. 계산식·행 매핑·판정 기준·범위는 바꾸지 않았다.

## 5. 변경 요약과 알려진 한계

`dist/m4m5.html` 한 파일(347,487 bytes)을 더블클릭하면 서버 없이 한 화면에서 CSV 6개를 판별·계산해 종합판정과 반복성·직선성·민감도 결과를 보이고, 맨 위 줄의 버튼으로 CLAYDOX용 Excel을 내려받는다. 바뀐 점과 알려진 한계는 `docs/RELEASE_NOTES.md`를 따른다.

## 6. 태그 제안

`v0.2.0-proto` (화면이 3단계에서 한 화면으로 바뀐 두 번째 시연 후보). `package.json` 버전은 0.1.0 그대로다 (소스라 건드리지 않음). 이전 `v0.1.0-proto`는 그대로 둔다. 사용자에게 줄 바탕화면 폴더도 같은 이름 `M4M5 유속계 정도검사 도구 v0.2.0-proto`로 하나만 둔다.

## 6-1. UIPRO 이후 코드 변경, 재판정 없음 (v0.2.1-proto)

위 판정(Reality Checker v2 재판정)은 `e995590` 코드 기준이다. 그 뒤 UI/UX Pro Max 보완(UIPRO)으로 `src/ui` 5개 파일(`inputs.js`, `main.js`, `sensChart.js`, `style.css`와 시험 `tests/e2e/fileurl.spec.js`)이 바뀌었고, Reality Checker는 이 코드를 다시 판정하지 않았다. 대신 다음이 확인했다.

- Code Reviewer 승인 (`ed8f1df`, `6e2798f`), P0~P3 0건.
- QA 최종 확정 (`6b56134`): P0~P3 0건, npm test 175, e2e 146, 빌드 348,420 B, check-dist 외부 URL 0, sample 36,406 B 차이 0.
- 접근성 UIPRO 확인 (`5fe5c09`), C1은 `00cac87`에서 수정.
- god 최종 검수 (clean clone `2fd9fd6`): npm test 175/175, chrome e2e 73/73, 빌드 348,420 B, check-dist 외부 URL 0, `src/core`·`src/excel`·`templates` 변경 0, 1366 화면 콘솔 오류 0.

변경 내용: 좁은 화면 Tab·낭독 순서, 민감도 그래프 글자 14px, 입력 16px, touch-action, 전화번호 inputmode, 색 토큰. 계산·Excel 출력은 그대로다. 위 1~4절의 수치(347,487 B, 174, 116 등)는 `5070d0f` 판정 시점 값이다. 태그는 `v0.2.1-proto`로 올린다 (god 승인, 로컬 주석 태그, push 없음). 4절 사람 확인 항목은 그대로 남는다.

## 6-2. V3 이후 코드 변경, 재판정 없음 (v0.3.0-proto)

위 6-1절의 `v0.2.1-proto`(코드 `00cac87`) 이후 V3(A·B·C·C+)로 `src/ui` 7개 파일(`index.html`, `inputs.js`, `main.js`, `modal.js`(신규), `results.js`, `sensChart.js`, `style.css`)과 시험 `tests/e2e/fileurl.spec.js`가 바뀌었다. 최종 코드는 `e67003a`(이후 tests·docs만)이고 Reality Checker는 이 코드를 다시 판정하지 않았다. 대신 다음이 확인했다 (판정 조건부는 그대로, god가 재판정을 택하면 그때 따른다).

- Code Reviewer 승인 (`a637d2d`).
- 접근성 확인 (`7ed90c4`, `b276a4c`).
- QA 회귀 (`826cc88`, `a21651b`) + 모달 단언 보강 (`c4ea628`): P0~P2 0건.
- 내가 HEAD `a21651b`에서 직접 실행: `git diff --stat e67003a..HEAD -- src scripts templates` 변경 0, build 354,253 B, check-dist 외부 URL 0건, npm test 175 / pass 175 / fail 0, sample 36,406 B. e2e 194(Chrome+Edge)는 QA 값이다.

변경 내용: 장비 정보 두 묶음, 모달 3개(그래프·환경 조건 / 주요 셀 / 계산에 쓴 행), 저장 화면 2단계(「Excel 만들고 저장」→「Excel로 저장」→「Excel 저장」, 「뒤로」), 판정 카드 색(적합 초록·부적합 빨강). 계산·Excel 출력은 그대로다. 4절 사람 확인 항목(H1~H4, H8~H11, NVDA·고대비 등)은 그대로 남고, 새 화면으로 실험 PC 확인(H5~H7)을 다시 하는 것이 안전하다. 최종 검수는 god이 Must 기준을 직접 실행해 확인한다. 로컬 주석 태그 `v0.3.0-proto`는 god 승인 뒤 이 커밋 직후 HEAD에 걸었다(push 없음).

## 7. 근거 문서

`planning/REALITY_CHECK.md`, `planning/ROUNDS.md`, `planning/QA_final.md`, `planning/A11Y_REVIEW.md`, `planning/SECURITY_REVIEW.md`, `planning/HUMAN_CHECKS.md`, `docs/RELEASE_NOTES.md`, `docs/SPEC.md`.
