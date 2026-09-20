# GitHub Actions + Cloudflare Pages 배포 표준

이 저장소는 `.github/workflows/deploy-cloudflare-pages.yml`로 CI와 배포를 함께 수행합니다.

- `master`에 push하면 테스트·빌드가 통과한 경우 Cloudflare Pages의 운영 배포를 갱신합니다.
- `master` 대상 pull request는 `pr-번호` 이름의 Pages 미리보기 배포를 만듭니다.
- 외부 fork에서 온 pull request는 보안을 위해 테스트·빌드만 수행하며, 배포 Secret에는 접근하지 않습니다.
- Actions 화면에서는 **Run workflow**로 수동 배포를 실행할 수 있습니다.
- 같은 브랜치에서 새 실행이 시작되면 이전 실행은 취소됩니다.

## 처음 한 번의 연결

1. GitHub에서 비어 있는 저장소를 만든 뒤, 로컬 저장소에 `origin` 원격을 추가하고 현재 이력을 push합니다.
2. Cloudflare Pages에서 기존 `postal-label-service` 프로젝트의 **Settings → API tokens**를 열어, 계정 범위의 API 토큰을 만듭니다. 토큰에는 해당 계정의 **Cloudflare Pages: Edit** 권한이 필요합니다.
3. GitHub 저장소의 **Settings → Secrets and variables → Actions**에 다음 값을 추가합니다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 2단계에서 만든 Cloudflare API 토큰 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | `postal-label-service` |

4. `master`에 push하거나 Actions에서 수동 실행합니다. 첫 실행이 성공하면 기존 Pages 도메인에 자동 반영됩니다.

토큰과 계정 ID는 절대로 커밋하거나 `.env` 파일에 저장하지 않습니다. GitHub Actions Secret으로만 보관합니다.

## 새 정적 서비스에 재사용하기

새 Vite/정적 서비스에도 이 workflow 파일을 복사한 뒤 아래만 바꿉니다.

1. 운영 브랜치가 다르면 `on.push.branches` 및 `on.pull_request.branches`를 수정합니다.
2. 빌드 결과 디렉터리가 `dist`가 아니면 마지막 `pages deploy` 명령의 첫 인자를 수정합니다.
3. 새 Cloudflare Pages 프로젝트를 만들고, 그 이름을 저장소 변수 `CLOUDFLARE_PAGES_PROJECT`에 넣습니다.
4. 같은 Cloudflare 계정이라면 기존 두 Secret을 각 저장소에 다시 등록하거나 조직 Secret으로 관리합니다.

프로덕션에서는 GitHub 저장소의 **Settings → Branches**에서 `master`에 pull request와 필수 상태 검사 `verify-and-deploy`를 요구하는 규칙을 추가하는 것을 권장합니다.
