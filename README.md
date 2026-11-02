# ktl-flow-pc — A-2 실험 PC 도구

담당 **경태 · 영진** (서로 리뷰 짝) · 과제 A(유속계 정도검사)

Pi QR 한 번 + 풍동 CSV 6개 → 반복성·직선성·민감도 계산 확인 → 시트·셀 위치가 고정된 **통일 Excel**.

| 기준 문서 | |
|---|---|
| 요구사항 | [REQ-A2-01~10](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/01-요구사항명세.md#3-a-2-실험-pc-도구--경태--영진) |
| QR 입력 | [02 §4](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#4-qr-스키마-a-1--a-2) · [테스트 벡터](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/contracts/qr-test-vectors.json) |
| 출력 · 계산식 | [02 §5](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#5-a-2-출력-형식-통일-excel) |
| 화면 | [PC-01~04](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/03-UI시나리오.md#a-7-pc-01--pc-04-실험-pc-도구) |

## 형태·화면 기준

단일 HTML로 진행한다([이슈 #1 결정](https://github.com/YC-Dr-link/ktl-flow-pc/issues/1#issuecomment-6496196210)). 설치·서버 실행 없이 오프라인으로 전달하기 쉽다. 화면은 제공된 **M4·M5 v0.2.1-proto**의 한 화면 작업대, 고정 저장 버튼, 파일 6칸, 결과 카드·추가 입력 영역을 기반으로 한다.

이번 뼈대는 QR 입력 미리보기와 파일 선택·끌어놓기·초기화·반응형 배치를 제공한다. 파일 내용 판별·계산·시험자 확인·Excel 저장은 연결 전이며, 실제 업무 결과를 만들지 않는다. 입력은 메모리에만 유지한다.

## 실행

1. `index.html` 하나를 PC로 복사한다.
2. 파일을 더블클릭해 Microsoft Edge 또는 Chrome에서 연다(설치·서버·인터넷 불필요).
3. QR 입력란과 CSV 파일 선택·끌어놓기·초기화 흐름을 확인한다.

## 개발·검증

수정은 `src/index.template.html`(구조), `src/styles.css`(프로토타입 스타일), `src/app.js`(연결 흐름)에서 한다. `python build.py`로 배포 파일 `index.html`과 CSS/JS의 CSP 해시를 다시 만든다. 빌더는 Python 표준 라이브러리만 사용한다. 실행 PC에는 Python이나 소스 폴더가 필요 없다.

```powershell
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python -m pytest -q
```

설치된 Edge로 테스트하려면 두 번째 명령 대신 `$env:KTL_BROWSER_CHANNEL = 'msedge'`를 설정한다. 테스트는 HTML 하나만 임시 폴더에 복사해 인터넷을 차단한 상태로 실행한다. 빌드 재현성, 파일 선택·교체·드롭·초기화, 입력 초기화, 파일명 안전 표시, 반응형 DOM 순서와 외부 요청 여부를 확인한다.

## 프로토타입을 이어서 작업하는 기준

- [인계·후속 연결](docs/prototype-migration.md)을 먼저 읽는다. 앞으로 A-2 이슈는 이 소스 구조와 프로토타입을 기준으로 이어 간다.
- 프로토타입 원본·견본 CSV·견본 Excel·HTML 내부의 견본과 양식 바이너리는 저장소에 복사하지 않았다. 테스트는 메모리에서 만든 가짜 값만 사용한다.
- QR·계산·출력은 공동 문서 02 §4~5가 기준이다. 프로토타입과 충돌하면 공동 계약을 유지한다(2026-11-02 사용자 확인).
- 현재는 스타일과 작업 흐름을 재사용했다. 기존 압축 JavaScript의 판별·계산·Excel 구현은 아직 이식하지 않았다.
- 후속 라이브러리는 오프라인으로 포함하고 기존 MIT 고지를 보존한다. 현재 뼈대에는 JSZip·pako·xmldom이 포함되어 있지 않다.
