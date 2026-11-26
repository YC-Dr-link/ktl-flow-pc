// 미결정 가정과 바뀔 수 있는 기준값을 모은 유일한 설정 (docs/OPEN_QUESTIONS.md, planning/PLAN.md 5절)

export const config = {
  // 판정 기준 (%) — 이하이면 적합. FR-M4-08, 질문답변지 7번
  criteria: { repeatability: 2.0, linearity: 5.0, sensitivity: 4.0 },

  // Q1: 직선성 판정 방식. 'max' = 행별 오차 최댓값(일반사항 E30), 'mean' = 평균 오차(반복·직선성 J20)의 절댓값
  linearityMethod: 'max',

  // Q2: true면 소수 첫째 자리로 반올림한 값으로 판정, false면 반올림 전 값으로 판정
  judgeOnRounded: false,

  // 판정 비교 직전 유효숫자 자리수. 부동소수 잡음(정확히 5.0이어야 할 값이 5.000000000000004)만 걷는다. Q2는 그대로
  judgeSignificantDigits: 15,

  // FR-M4-09: 화면 표시 / 상세 표시 소수 자릿수 (사사오입)
  displayDecimals: 1,
  detailDecimals: 4,

  // Q3: 요약 파일 데이터 행 수. 다르면 ROW_COUNT 오류
  rowCounts: { rep: 10, lin: 10, sen: 30 },

  // Q3: 반복성 행 순서 (1부터 센 데이터 행 번호). 홀수 행 ZERO, 짝수 행 SPAN
  repeatabilityOrder: { zeroRows: [1, 3, 5, 7, 9], spanRows: [2, 4, 6, 8, 10] },

  // Q3: 직선성 행 분할. 1~5행 = 30 %, 6~10행 = 70 %
  linearitySplit: { p30: [1, 5], p70: [6, 10] },

  // Q3: 민감도 그룹 순서. 그룹 하나는 rowsPerGroup행이고, 각도는 CSV에 없어 행 순서로만 정해진다
  sensitivityRowsPerGroup: 3,
  sensitivityGroups: [
    { angle: 0, point: '30%' },
    { angle: 0, point: '70%' },
    { angle: -10, point: '30%' },
    { angle: -10, point: '70%' },
    { angle: -5, point: '30%' },
    { angle: -5, point: '70%' },
    { angle: 5, point: '30%' },
    { angle: 5, point: '70%' },
    { angle: 10, point: '30%' },
    { angle: 10, point: '70%' },
  ],

  // S9: 민감도 오차 소스. 'column' = 요약 CSV의 오차 열(I열) 그대로, 'recompute' = (측정-기준)/기준*100 다시 계산
  sensitivityErrorSource: 'column',

  // EXCEL_MAPPING 4절: 차트(그래프)의 각도 순서
  chartAngleOrder: [-10, -5, 0, 5, 10],

  // 6개 파일에서 서로 같아야 하는 머리글 행 번호 (의뢰기관, 모델명, 기기번호, 최대유속, 교정일)
  headerCheckRows: [1, 4, 5, 6, 10],

  // SOURCE_MISMATCH 경고 기준: 요약 측정유속과 source 측정유속 평균의 상대오차 (Q6, S8)
  sourceTolerance: 1e-6,

  // S1: 접수번호 추출. 'firstToken' = 1행 B열의 첫 공백 앞(docs), 'left15' = 계산식.xlsx D3 수식(LEFT(…,15))
  receiptNoMode: 'firstToken',

  // S3: 대기압 kPa → hPa 배수 (CALCULATION 4.4). 원본 수식은 CSV 단위 칸에 따라 배수가 바뀐다
  pressureKpaToHpa: 10,

  // S2: 일반사항 H10 속도 단위. 원본은 기기 종류가 피토관이 아니면 '(Sm/s)'
  velocityUnitLabel: '(m/s)',

  // Q5: 계산식.xlsx 시트 이름 6개 (M5에서 사용)
  sheetNames: [
    '일반사항',
    '반복·직선성',
    'sensitive',
    '구조확인',
    '반복·직선성 raw data',
    'sensitive raw data',
  ],

  // Q8: 호기 표기 (M5에서 사용)
  unitNumberLabel: 'ST {값}',

  // FR-M5-05, Q11: 선택 입력을 비웠을 때 (M5에서 사용)
  optionalBlank: '-',

  // 원본 표기 (M5에서 사용). core 결과의 overall은 pass/fail을 '적합'/'부적합'으로 쓴다
  overallLabels: { pass: '적 합', fail: '부적합' },

  // 저장 파일 이름. hub #16 PM 제안대로 회사명은 파일 안에만 둔다 (공백 · 특수문자 위험). {회사명}도 쓸 수 있다
  fileNamePattern: '{접수번호}_유속계.xlsx',
};

export default config;
