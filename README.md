# 우편 라벨 생성 MVP

엑셀·CSV 또는 붙여넣기한 주소 데이터를 브라우저에서만 처리해 A4 우편 라벨 PDF로 만드는 정적 웹 애플리케이션입니다.

## 실행

```bash
npm install
npm run dev
```

터미널에 표시되는 `http://localhost:5173/` 주소로 접속해야 합니다. 개발 서버는 실행한 채로 두면 `src/`, `index.html` 등의 파일을 저장할 때 브라우저가 자동으로 갱신됩니다. 수정할 때마다 서버를 다시 시작할 필요가 없습니다. `index.html` 파일을 더블클릭해 `file:///...` 주소로 직접 열면 브라우저 보안 정책 때문에 JavaScript 모듈과 PDF 라이브러리를 불러올 수 없어, 파일 선택 외의 기능이 동작하지 않습니다.

배포용 결과물은 다음 명령으로 생성합니다.

```bash
npm run build
```

`dist/` 디렉터리를 정적 호스팅에 배포하면 됩니다.

## 구성

- `index.html` — 화면 구조와 SEO 기본 메타데이터
- `src/main.js` — 파일/CSV 처리, 열 인식, 미리보기, PDF 생성
- `src/templates.js` — 라벨 템플릿과 사용자 규격 검증
- `src/style.css` — 반응형 화면 스타일

## 데이터와 개인정보

파일 파싱, 데이터 정제, 미리보기, PDF 생성은 모두 브라우저 메모리에서 수행됩니다. 서버 API, 분석 도구, 외부 웹폰트 CDN, localStorage는 사용하지 않습니다. 번들에 포함된 라이브러리와 글꼴만 요청합니다.

지원 파일은 `.xlsx`, `.xls`, `.csv`입니다. Excel 파일은 시트를 선택할 수 있으며, CSV는 UTF-8 및 EUC-KR/CP949 계열 텍스트와 쉼표·탭·세미콜론 구분자를 우선 처리합니다. 암호화되었거나 읽을 수 없는 파일은 오류를 보여줍니다. 매크로는 실행하지 않습니다.

## PDF와 인쇄

PDF는 A4 `210 × 297mm` 좌표계로 생성됩니다. 라벨 위치는 mm 단위로 계산되며, 가로·세로 보정값도 PDF와 미리보기에 함께 적용됩니다. 인쇄 대화상자에서는 **배율 100% / 실제 크기**를 선택하고 “페이지에 맞춤”을 해제해야 합니다.

한글 PDF에는 프로젝트에 포함되는 전체 글리프 Noto Sans CJK KR OTF 글꼴을 **부분 서브셋 없이** 임베드합니다. PDF 용량은 커지지만, 모든 한글 음절이 PDF 뷰어와 프린터에서 정확히 표시되도록 한 선택입니다. 글꼴은 SIL Open Font License 1.1로 제공되며, 원본은 [Noto CJK 프로젝트](https://github.com/notofonts/noto-cjk)에서 관리됩니다.

## 기본 라벨 템플릿

`src/templates.js`에는 폼텍의 공식 Microsoft Word 등록 정보(2023-05-07 기준)에서 얻은 시작 여백과 피치를 mm 단위로 분리해 두었습니다.

| 제품 | 배치 | 시작 여백(좌/상) | 라벨 | 가로/세로 간격 |
| --- | --- | --- | --- | --- |
| 폼텍 3107 | 2 × 8 | 4.7 / 14.2mm | 99.1 × 33.9mm | 2.5 / 0mm |
| 폼텍 3105 | 3 × 7 | 8.0 / 15.8mm | 63.5 × 38.1mm | 2.5 / 0mm |
| 폼텍 3108 | 2 × 7 | 5.0 / 13.8mm | 99.1 × 38.1mm | 2.5 / 0mm |

공식 근거: [폼텍 Word 사이즈 추가/수정 정보](https://www.formtec.co.kr/software/software_manual.html?board=manual&id=27&kw=&kw_name=&mode=read&page=2)

## 새 라벨 규격 추가

`src/templates.js`의 `templates` 배열에 아래 형태의 객체를 추가합니다. 값은 반드시 제조사 공식 템플릿 또는 공식 사양을 기준으로 입력합니다.

```js
{
  id: 'manufacturer-model',
  name: '제조사 모델 · 열 × 행',
  paper: { width: 210, height: 297 },
  columns: 2,
  rows: 8,
  labelWidth: 99.1,
  labelHeight: 33.9,
  marginLeft: 4.7,
  marginTop: 14.2,
  horizontalGap: 2.5,
  verticalGap: 0
}
```

## 향후 확장

광고, 계정, 서버 저장, 주소 API 등은 MVP에 포함하지 않았습니다. 필요성이 검증된 뒤에만 별도 검토합니다.
