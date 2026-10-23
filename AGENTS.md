# AGENTS.md — ktl-flow-pc

> 코딩 Agent(Claude Code · Cursor · Codex 등)가 이 레포에서 일할 때 지키는 규칙. 사람도 같이 본다.

## 이 레포
- 파트: **A-2 실험 PC 도구** · 담당 경태(@newwwwwb) · 영진(@aengjins)
- 무엇을 만드나: 요구사항 REQ-A2-01~10 — https://raw.githubusercontent.com/YC-Dr-link/ktl-hub/main/docs/01-요구사항명세.md
- 파트 정보 · 제출물 형태: https://raw.githubusercontent.com/YC-Dr-link/ktl-hub/main/docs/04-역할분담.md
- 기술: 추천: Python (pandas + openpyxl, 화면 tkinter, PyInstaller로 exe). 형태 결정은 이슈 #1 댓글을 따른다.

## 계약 (바꾸지 말 것)
QR 입력(02 §4, 테스트 벡터 https://raw.githubusercontent.com/YC-Dr-link/ktl-hub/main/docs/contracts/qr-test-vectors.json)과 통일 Excel 출력 형식·계산식(02 §5).
계약과 다르게 해야 할 것 같으면 **멈추고 사람에게 보고**한다. 사람이 ktl-hub에 `계약변경` 이슈를 연다.
- API · 모듈 계약 · QR · 출력 형식: https://raw.githubusercontent.com/YC-Dr-link/ktl-hub/main/docs/02-API명세.md
- 화면 시나리오: https://raw.githubusercontent.com/YC-Dr-link/ktl-hub/main/docs/03-UI시나리오.md

## 일하는 방식
1. **이슈 하나만** 한다. 사람이 준 이슈 번호(또는 협업 사이트의 📋 작업 지시서)를 기준으로 범위를 정한다. 다른 파트 코드는 건드리지 않는다.
2. 브랜치에서 일한다: `git checkout main && git pull && git checkout -b feat/<이슈번호>-<짧은설명>`. main에 직접 push하지 않는다.
3. 작게 커밋한다. 메시지: `feat: 무엇을 (#이슈번호)` (feat · fix · docs · test · refactor · chore). 커밋 · PR에 AI 서명 줄(Co-Authored-By 등)을 넣지 않는다.
4. 테스트를 같이 쓴다: pytest — 합성 풍동 CSV 6개 세트로 판별·계산이 정답 JSON과 소수 셋째 자리까지 일치
5. README의 실행 방법(3줄 이내)을 맞춘다.
6. 끝나면 사람에게 보고한다: 바뀐 파일, 테스트 결과, `TODO(확인 필요)` 목록, PR 본문 초안(`Closes #이슈번호` 포함). PR은 400줄 안쪽이 좋다. 크면 나눈다.

## 하지 말 것
- **실제 견본 데이터(CSV · 사진 · 엑셀 · txt), 실명, 업체명, 연구원 이름을 커밋하지 않는다.** 테스트 파일은 가짜 값으로 만들어 `synthetic/`에만. CI `data-guard`가 막는다.
- 제품 코드에서 인터넷 호출(외부 API · CDN · 폰트 · 자동 업데이트) 금지. 현장은 오프라인이다.
- KTL 내부 규정 · 시스템 · 장비 · 실제 데이터 형식처럼 문서에 없는 것은 **추측하지 않는다.** 코드에 `TODO(확인 필요): …`로 남기고 보고한다.
- 병합하지 않는다. 병합은 PM만 한다.

## 이 파트에서 특히
- 풍동 CSV는 cp949, 1~11행 기기 정보 · 12행 칼럼 · 13행 단위 · 14행부터 데이터. 칼럼명 공백(`측정 유속`, `압 력`)은 지우고 매핑.
- 파일 종류는 파일명이 아니라 내용으로 판별한다 (결과/source, 반복성/직선성/민감도).
- PC가 한글 입력 상태여도 QR 스캔 문자열이 깨지지 않게 두벌식 자모 → 영문 키 복원.

## 일정
관문 1 10/25 · 관문 2 11/1(가짜 모듈로 끝까지) · 관문 3 11/6(기능 완성 · 코드 동결) · 리허설 11/8 — https://raw.githubusercontent.com/YC-Dr-link/ktl-hub/main/docs/06-일정.md
