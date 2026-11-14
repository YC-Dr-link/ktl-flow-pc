# 팀 공동개발 문서 원문 미러 출처

받은 날짜 2026-10-29 · 받은 사람 Product Owner (gh CLI, 읽기만). 아래 파일은 GitHub 원문과 바이트까지 같다(각 파일의 git blob SHA를 GitHub 값과 대조해 18개 모두 일치). **수정하지 않는다.** 이 폴더의 `.gitattributes`(`* -text`)는 줄끝 변환을 막아 원문을 지키려고 둔 것이다.

제외: ktl-hub `.github/`(CODEOWNERS·scripts·workflows). 팀원 이름과 GitHub 아이디는 원문에 있는 그대로다. 연락처(이메일·전화)는 원문에 없다(정규식 검사 0건).

| 저장소 | 경로 | 커밋 SHA | blob SHA |
|---|---|---|---|
| YC-Dr-link/ktl-hub | `README.md` | `e9a729382a2e` | `59fec775165d` |
| YC-Dr-link/ktl-hub | `docs/01-요구사항명세.md` | `e9a729382a2e` | `953570428119` |
| YC-Dr-link/ktl-hub | `docs/02-API명세.md` | `e9a729382a2e` | `d0ff3ad5cecc` |
| YC-Dr-link/ktl-hub | `docs/03-UI시나리오.md` | `e9a729382a2e` | `f81944af42f1` |
| YC-Dr-link/ktl-hub | `docs/04-역할분담.md` | `e9a729382a2e` | `39cc6c61c4e5` |
| YC-Dr-link/ktl-hub | `docs/05-협업규칙.md` | `e9a729382a2e` | `0eae53e61b8e` |
| YC-Dr-link/ktl-hub | `docs/06-일정.md` | `e9a729382a2e` | `80164b34e645` |
| YC-Dr-link/ktl-hub | `docs/api/field-server.openapi.yaml` | `e9a729382a2e` | `6cf3949260db` |
| YC-Dr-link/ktl-hub | `docs/contracts/qr-test-vectors.json` | `e9a729382a2e` | `3a2d84d8c9e8` |
| YC-Dr-link/ktl-flow-pc | `README.md` | `f1ff030c0326` | `4d66a2170761` |
| YC-Dr-link/ktl-flow-pi | `README.md` | `8c287da5a9a5` | `f4976521322d` |
| YC-Dr-link/ktl-field-server | `README.md` | `18fa409a7318` | `083d8a63a2aa` |
| YC-Dr-link/ktl-field-web | `README.md` | `9d6d360847ec` | `ac69a92da4c1` |
| YC-Dr-link/ktl-field-modules | `README.md` | `2a2c2bb443e5` | `53fcd9e27e94` |
| YC-Dr-link/ktl-field-modules | `categories.yaml` | `2a2c2bb443e5` | `1e5174030b64` |
| YC-Dr-link/ktl-field-modules | `contract/ktl_contract/__init__.py` | `2a2c2bb443e5` | `3d4ee1012065` |
| YC-Dr-link/ktl-field-modules | `contract/ktl_contract/fakes.py` | `2a2c2bb443e5` | `41b5ab59f070` |
| YC-Dr-link/ktl-field-modules | `contract/ktl_contract/testing.py` | `2a2c2bb443e5` | `506a62589fa4` |

## 다시 받는 법

커밋 SHA 고정으로 같은 파일을 받는다. 최신을 받으려면 `?ref=`를 빼고, 받은 뒤 이 표의 SHA와 날짜를 고친다.

```sh
# 저장소 폴더(docs/team/source)에서
gh api "repos/YC-Dr-link/ktl-hub/contents/README.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/README.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/01-요구사항명세.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/01-요구사항명세.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/02-API명세.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/02-API명세.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/03-UI시나리오.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/03-UI시나리오.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/04-역할분담.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/04-역할분담.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/05-협업규칙.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/05-협업규칙.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/06-일정.md?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/06-일정.md"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/api/field-server.openapi.yaml?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/api/field-server.openapi.yaml"
gh api "repos/YC-Dr-link/ktl-hub/contents/docs/contracts/qr-test-vectors.json?ref=e9a729382a2e6e04b625822c16f2bb7eebf051e6" -H "Accept: application/vnd.github.raw" > "ktl-hub/docs/contracts/qr-test-vectors.json"
gh api "repos/YC-Dr-link/ktl-flow-pc/contents/README.md?ref=f1ff030c032684cf422b8ecd3218a0b110cc2f09" -H "Accept: application/vnd.github.raw" > "ktl-flow-pc/README.md"
gh api "repos/YC-Dr-link/ktl-flow-pi/contents/README.md?ref=8c287da5a9a5b928992663e7dd9253eb715a1673" -H "Accept: application/vnd.github.raw" > "ktl-flow-pi/README.md"
gh api "repos/YC-Dr-link/ktl-field-server/contents/README.md?ref=18fa409a7318cbd06c7dc29867b30a7791848212" -H "Accept: application/vnd.github.raw" > "ktl-field-server/README.md"
gh api "repos/YC-Dr-link/ktl-field-web/contents/README.md?ref=9d6d360847ec5fb0bf490e51c3fb533cd93f94b4" -H "Accept: application/vnd.github.raw" > "ktl-field-web/README.md"
gh api "repos/YC-Dr-link/ktl-field-modules/contents/README.md?ref=2a2c2bb443e5076e1bc2424d75efe359172981b6" -H "Accept: application/vnd.github.raw" > "ktl-field-modules/README.md"
gh api "repos/YC-Dr-link/ktl-field-modules/contents/categories.yaml?ref=2a2c2bb443e5076e1bc2424d75efe359172981b6" -H "Accept: application/vnd.github.raw" > "ktl-field-modules/categories.yaml"
gh api "repos/YC-Dr-link/ktl-field-modules/contents/contract/ktl_contract/__init__.py?ref=2a2c2bb443e5076e1bc2424d75efe359172981b6" -H "Accept: application/vnd.github.raw" > "ktl-field-modules/contract/ktl_contract/__init__.py"
gh api "repos/YC-Dr-link/ktl-field-modules/contents/contract/ktl_contract/fakes.py?ref=2a2c2bb443e5076e1bc2424d75efe359172981b6" -H "Accept: application/vnd.github.raw" > "ktl-field-modules/contract/ktl_contract/fakes.py"
gh api "repos/YC-Dr-link/ktl-field-modules/contents/contract/ktl_contract/testing.py?ref=2a2c2bb443e5076e1bc2424d75efe359172981b6" -H "Accept: application/vnd.github.raw" > "ktl-field-modules/contract/ktl_contract/testing.py"
```

대조: `git hash-object <파일>` 값이 위 blob SHA와 같아야 한다.
