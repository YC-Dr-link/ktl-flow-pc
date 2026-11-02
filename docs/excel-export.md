# 통일 Excel 출력 — 이슈 #7

브라우저에서는 `src/xlsx-package.js` 다음 `src/excel.js`를 인라인 포함한다. Node 개발 환경에서는 `require('./src/excel.js')`를 사용한다. 제품 실행에는 서버·Node·외부 라이브러리·CDN이 필요 없다. ZIP STORE 방식으로 OOXML을 직접 구성한다.

```javascript
const input = { metadata, results, files, toolVersion: '0.1.0' };
const preview = await KtlExcel.preview(input);
// UI가 위 파일·기기 정보·계산 결과를 표시하고 시험자가 실제 확인한 뒤에만 생성한다.
const confirmation = { reviewKey: preview.reviewKey, confirmedBy: testerId,
                       confirmedAt: '2026-11-02T14:00:00+09:00' };
const workbook = await KtlExcel.build(input, confirmation);
// workbook: {fileName, suggestedDirectory, mimeType, bytes: Uint8Array}
```

## 입력·확인 계약

- `metadata`: `receiptNo`(NN-NNNNNN-NN), `detailNo`(양의 정수), `maximum`(양수) 필수. `company`, `model`, `serial`, `approvalNo`, `testDate`, `tester`는 표시할 원래 문자열이다.
- `metadata.environment`: `pressure`, `temperature`, `humidity`별 `{min,max,mean}` 숫자. 누락값은 빈칸이며 0으로 만들지 않는다. 파서·계산 쪽에서 확인된 값을 제공한다.
- `results`: 이슈 #5 `KtlCalc.calculate`의 반환값. 반복성 ZERO/SPAN, 직선성 선택값·정의, 민감도 최댓값·10개 그룹을 사용하며 다시 계산하거나 반올림하지 않는다.
- `files`: 6개 `{name,bytes:Uint8Array,kind,role,manual}`. `kind`는 `repeatability|linearity|sensitivity`, `role`은 `result|source`이며 조합이 중복되면 안 된다. 파서가 내용으로 판별하고 시험자가 확인한 배정을 전달한다. 이름으로 종류를 추측하지 않는다.
- SHA-256은 원본 바이트 전체에서 계산한다. 브라우저 WebCrypto가 필요하며 `file://` 오프라인 Edge에서 검증했다. 입력은 복사해서 처리하므로 수정하지 않는다. 파일당 최대 5 MB다.
- `preview.reviewKey`는 메타데이터·계산 결과·도구 버전·각 파일의 이름/배정/원본 해시를 묶는다. 확인 후 하나라도 바뀌면 재확인 전까지 출력이 거부된다. 확인자와 오프셋 포함 ISO 8601 시각이 필요하다.
- 원본 cp949는 raw 표시를 위해 엄격히 읽는다. 결과/source 표식·행/칼럼 수를 확인하지만 종류 자동 판별 전체는 이슈 #4 범위다.

## 저장

파일명은 `<receiptNo>-<detailNo>_유속계.xlsx`다. 예: `26-000001-01-2_유속계.xlsx`.

저장 버튼의 사용자 동작으로 `const folder = await showDirectoryPicker()`를 먼저 호출한 뒤 `await KtlExcel.saveToDirectory(folder, input, confirmation)`를 호출하면 선택 폴더 안에 접수번호 폴더를 만들고 저장한다. 같은 파일이 있으면 `FILE_EXISTS`로 멈춘다. UI가 덮어쓰기를 별도로 확인한 경우에만 네 번째 인수 `{overwrite:true}`를 전달한다. 쓰기 실패 시 스트림을 중단하고 한국어 오류를 반환한다.

폴더 API가 없는 브라우저에서는 `build`의 bytes를 Blob 다운로드로 연결하고 사용자가 접수번호 폴더를 선택하도록 안내해야 한다. 이 모듈이 일반 다운로드 폴더 위치를 강제로 바꾸지는 않는다.

## 고정 위치·원본 보존

- 시트 순서: `일반사항`, `반복직선성`, `민감도`, `구조확인`, `raw data`, `출처`.
- 일반사항 A열 항목/B열 값: 2 접수번호, 3 업체, 4 모델, 5 제조번호, 6 형식승인번호, 7 최대 범위, 8 시험일, 9 시험자. 11~13 대기압, 14~16 온도, 17~19 습도(최소·최대·평균). 누락값은 빈칸이다.
- 반복직선성: 위쪽에 ZERO/SPAN·직선성 30/70%·선택 정의·기준, 아래쪽에 결과 파일의 칼럼·단위·원 값을 둔다. 민감도는 그룹 평균 근거·최댓값·기준·원 값을 둔다. 그래프 2개는 이슈 #9 범위다.
- 구조확인은 빈칸이다. raw data는 입력 CSV 각 레코드를 같은 행 번호로 쓰고 1~13행 머리글도 보존한다. 파일별 열 블록만 나누며 위에 제목 행을 삽입하지 않는다.
- raw 블록 시작 열: 반복성 결과 A/source M, 직선성 결과 X/source AJ, 민감도 결과 AU/source BG. 문자열·앞자리 0·공백·따옴표·줄바꿈을 보존하고 수식으로 해석하지 않는다.
- 출처는 파일 1개=1행이다. 파일명·해시·판별 종류·결과/source·버전·생성 시각·수동 배정 여부·raw 시작 열·확인자·확인 시각을 기록한다.

## 개발 검증

Node 20+와 개발용 pytest를 설치하고 `python -m pytest -q tests/test_excel.py`를 실행한다. Node 경로 지정은 `KTL_NODE` 환경변수를 사용한다. 입력·확인·원본 바이트·ZIP CRC·XML·고정 셀·해시·저장 경로·덮어쓰기를 검증한다.

이슈 #1·#2·#5가 아직 미병합이므로 해당 커밋을 이 PR에 포함하지 않았다. 로컬에서는 그 모듈과 합성 두 세트 및 제공 견본 6개를 결합해 메모리에서 검증했다. 실제 견본·템플릿·생성 Excel은 커밋하지 않는다. UI 연결 이슈에서 빌더의 스크립트 순서와 CSP 해시, 파일/계산 변경 시 재확인 흐름을 연결해야 한다.

## TODO(확인 필요)

원본 성적서 양식 및 CLAYDOX 실제 가져오기 결과는 연구원·KTL PC에서 최종 확인한다. 현재 기준은 공동 문서 02 §5이며 프로토타입의 다른 시트 배치로 바꾸지 않았다. 현재 PC의 Excel 정상 열기 확인은 KTL PC 통합 검증을 대신하지 않는다.
