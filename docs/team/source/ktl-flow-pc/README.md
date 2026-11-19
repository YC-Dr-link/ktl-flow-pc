# ktl-flow-pc — A-2 실험 PC 도구

담당 **경태 · 영진** (서로 리뷰 짝) · 과제 A(유속계 정도검사)

Pi QR 한 번 + 풍동 CSV 6개 → 반복성·직선성·민감도 계산 확인 → 시트·셀 위치가 고정된 **통일 Excel**.

| 기준 문서 | |
|---|---|
| 요구사항 | [REQ-A2-01~10](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/01-요구사항명세.md#3-a-2-실험-pc-도구--경태--영진) |
| QR 입력 | [02 §4](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#4-qr-스키마-a-1--a-2) · [테스트 벡터](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/contracts/qr-test-vectors.json) |
| 출력 · 계산식 | [02 §5](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#5-a-2-출력-형식-통일-excel) |
| 화면 | [PC-01~04](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/03-UI시나리오.md#a-7-pc-01--pc-04-실험-pc-도구) |

## 첫 번째 할 일 — 10/24(토)까지

**형태 결정**: 파이썬(추천) 또는 단일 HTML. 이슈 #1에 결정과 이유를 남긴다.

추천 구성 (파이썬):
```
flowpc/
  qr.py         QR 파싱 · 체크값 · 한글 자모 → 영문 복원
  csvread.py    cp949 읽기 · 1~11행 기기 정보 · 12행 칼럼 · 종류 판별
  calc.py       반복성 · 직선성(2가지) · 민감도
  excel.py      openpyxl로 통일 Excel + 그래프
  app.py        tkinter 화면 (PC-01~04)
synthetic/      가짜 풍동 CSV 6개 세트 (생성 스크립트 포함)
tests/
```

## 실행

(뼈대 PR에서 채운다)
