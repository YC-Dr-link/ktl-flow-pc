# ktl-flow-pc — A-2 실험 PC 도구

담당 **경태 · 영진** (서로 리뷰 짝) · 과제 A(유속계 정도검사)

Pi QR 한 번 + 풍동 CSV 6개 → 반복성·직선성·민감도 계산 확인 → 시트·셀 위치가 고정된 **통일 Excel**.

| 기준 문서 | |
|---|---|
| 요구사항 | [REQ-A2-01~10](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/01-요구사항명세.md#3-a-2-실험-pc-도구--경태--영진) |
| QR 입력 | [02 §4](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#4-qr-스키마-a-1--a-2) · [테스트 벡터](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/contracts/qr-test-vectors.json) |
| 출력 · 계산식 | [02 §5](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/02-API명세.md#5-a-2-출력-형식-통일-excel) |
| 화면 | [PC-01~04](https://github.com/YC-Dr-link/ktl-hub/blob/main/docs/03-UI시나리오.md#a-7-pc-01--pc-04-실험-pc-도구) |

## 형태 결정

**단일 HTML**로 진행한다. 설치·서버 실행 없이 브라우저에서 열 수 있고, HTML·CSS·JavaScript를 한 파일에 포함해 오프라인으로 전달하기 쉽다. 경태의 [이슈 #1 결정 댓글](https://github.com/YC-Dr-link/ktl-flow-pc/issues/1#issuecomment-6496196210)을 따른다.

이번 PR은 PC-01~04 화면 이동 뼈대다. QR 검증·CSV 판별·계산·Excel 출력은 각 후속 이슈에서 구현한다. 입력값은 메모리에만 남고 새로 열면 초기화된다.

## 실행

1. `index.html` 하나를 PC로 복사한다.
2. 파일을 더블클릭해 최신 Microsoft Edge 또는 Chrome에서 연다(설치·서버·인터넷 불필요).
3. 왼쪽 단계 또는 이전·다음 버튼으로 PC-01~04 화면을 확인한다.

## 개발·검증

배포 파일과 소스는 `index.html` 하나다. 외부 스크립트·폰트·CDN·네트워크 요청·빌드 단계가 없다. 테스트 도구는 개발 시에만 설치하며 제품 실행에는 필요하지 않다.

```powershell
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python -m pytest -q
```

설치된 Edge로 테스트하려면 두 번째 명령 대신 `$env:KTL_BROWSER_CHANNEL = 'msedge'`를 설정한다. 인터넷을 차단한 브라우저 컨텍스트에서 `file://`로 열기, 단계 이동·경계·키보드·새로고침 초기화, 좁은 화면과 외부 요청 여부를 검사한다.

## 후속 연결·확인 필요

- QR: 공동 문서 02 §4 및 QR 테스트 벡터로 검증·한글 입력 복원을 연결한다.
- CSV·계산·Excel: 공동 문서 02 §5의 형식·계산식을 유지하며 원본 보존·해시 기록·시험자 확인을 연결한다.
- `TODO(확인 필요)`: Excel 출력 담당과 단일 HTML 내 xlsx 생성·그래프 포함 방식을 결정한다. 의존성을 도입하면 라이선스를 확인하고 로컬에 포함한다. CDN은 사용하지 않는다.
- 민감도 그래프 2개는 S 요구사항이다. 그래프 미지원 라이브러리만으로 완료 처리하지 않는다.
