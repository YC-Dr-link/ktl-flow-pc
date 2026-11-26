# ktl-flow-pc — A-2 실험 PC 도구

담당 **경태 · 영진** (서로 리뷰 짝) · 과제 A(유속계 정도검사)

풍동 CSV 6개 → 반복성·직선성·민감도 계산 확인 → 시트·셀 위치가 고정된 **통일 Excel**.

| 기준 문서 | |
|---|---|
| 요구사항 | [REQ-A2-01~10](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/01-요구사항명세.md#3-a-2-실험-pc-도구--경태--영진) |
| QR 입력 | [02 §4](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#4-qr-스키마-a-1--a-2) · [테스트 벡터](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/contracts/qr-test-vectors.json) |
| 출력 · 계산식 | [02 §5](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#5-a-2-출력-형식-통일-excel) |
| 화면 | [PC-01~04](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/03-UI시나리오.md#a-7-pc-01--pc-04-실험-pc-도구) |

## 구조

형태는 단일 HTML이다 (이슈 #1). `m4m5.html`은 손으로 고치지 않고 소스를 빌드해서 만든다.

```
src/core/      CSV 읽기 · 종류 판별 · 검증 · 계산(반복성 · 직선성 · 민감도) · 판정
src/excel/     고른 양식(.xlsx)에 값을 채우는 Excel 만들기
src/ui/        화면 (index.html · style.css · main.js · 폴더 감시 folderWatch.js)
scripts/       build.mjs(→ dist/m4m5.html, CSP 해시 계산) · check-dist.mjs(외부 URL 0건 검사)
synthetic/     합성 풍동 CSV 2세트와 정답(set_a · set_b, generate.py) · 합성 양식
tests/         계산 정답 · 경계값 · 판별 · Excel 테스트 (node --test), 합성 CSV · 배포 HTML 검사 (pytest)
```

## 실행

1. `m4m5.html`을 Chrome 또는 Edge로 연다 (설치 · 인터넷 필요 없음).
2. CSV 6개를 직접 넣거나 장비 출력 폴더를 선택하고, 새 검사분이 준비되면 「반영」을 누른다.
3. 저장 화면에서 양식(.xlsx)을 고르고 「Excel 저장」을 눌러 저장 폴더와 파일명을 지정한다 (합성 양식: `synthetic/template_synthetic.xlsx`).

## 개발

- 테스트: Node.js 22 이상에서 `npm ci` 후 `npm test` (합성 CSV 정답과 소수 셋째 자리까지 비교).
- 빌드: `npm run build` 후 `dist/m4m5.html`을 `m4m5.html`로 복사해 커밋한다. CI가 소스로 다시 빌드해 바이트를 비교한다.
