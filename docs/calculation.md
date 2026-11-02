# A-2 계산 모듈 — 이슈 #5

`src/calc.js`는 단일 HTML에 인라인 포함할 수 있는 의존성 없는 JavaScript다. 브라우저에서는 `globalThis.KtlCalc`, Node에서는 `require('./src/calc.js')`로 사용한다. DOM·파일·네트워크 접근, 입력 수정, 자동 확정·내보내기는 하지 않는다.

```javascript
const result = KtlCalc.calculate({
  maximum: 20,
  repeatability: repeatRows, // 결과 10행: {measured: number}
  linearity: linearRows,    // 결과 10행: {reference: number, measured: number}
  sensitivity: sensRows    // 결과 30행: {errorPct: number}, CSV의 오차(%)
}, {linearityMethod: 'signed_mean'});
```

숫자 문자열·빈칸은 CSV 파서에서 검증·변환한 후 전달한다. 파일명·source 행은 입력하지 않는다. 배열은 원래 결과 행 순서를 유지한다.

- 반복성: 홀수/ZERO·짝수/SPAN 각 5개의 표본표준편차(n-1)를 최대 유속으로 나눠 백분율로 반환한다. `zero`·`span`에 평균·표준편차·백분율, `percent`에 두 값 중 큰 값을 제공한다.
- 직선성: 앞 5행(30%)·뒤 5행(70%) 각각 `max_absolute`와 `signed_mean`을 모두 반환한다. 설정은 두 문자열 중 하나다. `low.selected`·`high.selected`는 선택한 원래 부호를 유지하고 요약 `percent`는 두 구간의 절댓값 중 큰 값이다. 기본은 공동 문서 01 §9의 보수적 정의에 맞춘 `max_absolute`다.
- 민감도: CSV 오차(%)를 3행씩 평균한 후 절댓값의 최댓값을 반환한다. 평균 전에 절댓값을 취하지 않는다. `groups`에는 각도(0, -10, -5, +5, +10) × 범위(30,70)의 10개 계산 근거를 제공한다.
- 계산값은 중간·최종 반올림하지 않는다. 표시 반올림과 시험자 확정은 UI에서 처리한다.
- 잘못된 행 수, 빈칸·문자열·NaN·무한대, 0 이하 최대/기준유속, 잘못된 정의, 비유한 계산 결과는 한국어 `CalculationError`와 `code`로 거부한다.

## 검증

`node --version`으로 Node 20+가 있는지 확인하고, 개발용으로 `python -m pip install pytest==9.2.0`을 설치한 후 `python -m pytest -q tests/test_calc.py`를 실행한다. Node 경로를 직접 지정하려면 `KTL_NODE` 환경변수를 사용한다. 제품 브라우저 실행에는 Python·Node가 필요 없다.

계산 전용 가짜 입력·정답은 `synthetic/calc-cases.json`에 있다. 이슈 #2가 아직 미병합이므로 그 커밋을 이 PR에 끌어오지 않는다. CSV 생성기와 제품 파서·UI·Excel은 해당 이슈에서 통합한다. 이슈 #1 병합 후 빌더가 `src/calc.js`를 `src/app.js`보다 먼저 인라인 포함하고 전체 스크립트의 CSP 해시를 갱신하도록 UI 연결 이슈에서 확장한다. 프로토타입의 기존 출력 배치 대신 공동 문서 02 §5를 유지한다.

## TODO(확인 필요)

직선성의 실제 업무 정의·성적서 값 선택과 KTL PC에서 견본 0.1/0.4/0.9% 재현은 연구원 확인 대상이다. 로컬 계산 대조는 KTL PC 검증이나 최종 통합 완료를 대신하지 않는다. 설정 변경 후 기존 확정 상태를 초기화하는 동작은 UI 이슈에서 연결한다.
