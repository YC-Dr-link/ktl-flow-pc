# 민감도 그래프 2개 — 이슈 #9

REQ-A2-08. 단일 HTML 방식을 유지하면서 Excel에서 편집 가능한 XY 산점도(선·마커) 두 개를 추가한다. 제공 프로토타입의 두 산점도 구조를 확인했으며 실제 측정값·견본·템플릿은 복사하지 않았다.

```javascript
// xlsx-package.js → excel.js → chart-package.js → sensitivity-charts.js 순서로 인라인 포함
const base = await KtlExcel.build(input, confirmation);
const workbook = KtlSensitivityCharts.add(base);
// workbook.bytes를 Blob 다운로드 또는 폴더 저장 단계에 전달
```

- 브라우저 전역은 `KtlSensitivityCharts`, Node에서는 `require('./src/sensitivity-charts.js')`다. 네트워크·DOM·외부 라이브러리가 필요 없다.
- 입력은 이슈 #7 출력 모듈이 생성한 ZIP STORE 통일 Excel 객체다. 일반적인 기존 Excel·압축 형식·다른 시트 배치는 지원 대상이 아니다. 입력 객체·바이트는 수정하지 않고 새 출력 객체를 반환한다.
- 이슈 #7 `saveToDirectory`는 내부에서 원래 `build`를 실행하므로 그대로 호출하면 차트가 포함되지 않는다. UI 통합 시 반드시 `build → add → 저장` 순서를 사용한다. 이 모듈이 저장 폴더·확인 절차를 우회하지 않는다.
- 데이터는 `민감도!A2:C11`의 각도·범위·부호 있는 3행 평균 오차를 읽는다. 각도는 -10,-5,0,+5,+10으로 정렬하며 30%·70%별 점 5개를 연결한다. 절댓값 그래프가 아니다.
- X축은 설치 각도(°), Y축은 평균 오차(%). 두 그래프는 같은 대칭 Y축 범위를 사용한다. 전체 오차가 0이어도 축 범위가 0이 되지 않는다.
- 그래프는 원 값 표 아래 `A51`, `E51`에 배치한다. 차트 데이터는 `AA1:AC6`에 있으며 Y값은 기존 C열을 참조하는 내부 수식과 캐시를 사용한다. Excel에서 표 값이 바뀌면 그래프도 갱신된다.
- 시트 개수·일반사항 고정 셀·원래 raw data·출처 SHA-256·파일명은 바꾸지 않는다. 차트 부품과 민감도 보조 셀·드로잉만 추가한다.
- 기존 차트/드로잉/관계·보조 셀이 있으면 덮어쓰지 않고 거부한다. 잘못된 각도/범위 조합·누락·NaN·무한대·축 초과·손상 ZIP CRC는 한국어 오류로 안내한다.

## 개발 검증

Node 20+와 개발용 pytest를 설치하고 `python -m pytest -q tests/test_sensitivity_charts.py`를 실행한다. Node 경로는 `KTL_NODE`로 지정할 수 있다. 제품 PC에는 Python·Node가 필요 없다.

로컬에서는 이슈 #7 실제 출력과 결합해 Microsoft Excel 16에서 시트 6개·차트 2개·각 5개 점·셀 수정에 따른 갱신을 확인했다. 그래프 PNG를 내보내 제목·축·데이터 표시도 확인했다. 합성 값만 사용하며 출력 Excel·이미지는 커밋하지 않는다.

`chart-package.js`는 이슈 #7의 ZIP 쓰기 방식을 재사용하고 CRC 검증 ZIP 읽기·바이너리 부품 보존을 추가한 독립 모듈이다. 기존 `xlsx-package.js`를 변경하지 않으며, 이슈 #7의 Excel 출력 모듈과 커밋은 이 PR에 포함하지 않았다.

## TODO(확인 필요)

연구원의 최종 그래프 양식·KTL PC/Excel 시연은 별도로 확인한다. 현재 구성은 공동 문서의 30%·70% 민감도와 제공 프로토타입의 산점도에 따른다. 최종 화면 연결 시 CSP 해시와 위 저장 파이프라인을 함께 연결한다.
