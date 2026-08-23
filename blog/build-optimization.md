---
slug: build-optimization
title: "[CI/CD] GitHub Actions 빌드 속도 70% 단축기: npm 한계 극복부터 Rust 번들러(Rspack) 도입까지"
date: 2026-08-23
authors:
  - name: Dongju Lee
    title: Oracle DBA & AI Architecture Specialist
    url: https://github.com/djpibo
    image_url: https://github.com/djpibo.png
tags: [CI/CD, Yarn v4, Rspack, Docusaurus, GitHub Actions, Optimization, TroubleShooting]
---
기술 블로그(Docusaurus)의 CI/CD 환경을 GitHub Actions로 구축한 후, 배포 파이프라인의 소요 시간이 **평균 1분 10초(70초)** 대에 머무르는 것을 확인했습니다. 

단순한 정적 페이지 빌드치고는 과도한 리소스가 소모되고 있다고 판단하여, 빌드 로그를 분석하고 병목 구간을 하나씩 제거해 나간 단계별 최적화(Optimization) 과정을 정리합니다.

<!--truncate-->

---

## 🚨 문제 진단: 초기 상태 (총 소요 시간: 70초)

GitHub Actions의 Step별 실행 시간을 프로파일링한 결과, 두 가지 명확한 병목 지점을 발견했습니다.
1. **Network I/O 병목 (약 35초):** 매 빌드마다 `npm install`을 통해 수백 MB의 패키지를 새로 다운로드.
2. **CPU 연산 병목 (약 30초):** JS 기반의 Webpack 엔진이 마크다운과 코드를 정적 HTML로 변환하는 데 시간 소모.

---

## 🛠️ 1단계: 패키지 다운로드 병목 제거 (Yarn v4 Zero-install)

가장 먼저 네트워크 다운로드 시간 자체를 아예 `0초`로 없애버리기 위해, 패키지 매니저를 **npm에서 Yarn v4(Berry)로 마이그레이션**했습니다.

### 📝 적용 코드: `.yarnrc.yml`
프로젝트 루트에 아래와 같이 설정을 추가하여 Zero-install을 세팅했습니다.

```yaml title=".yarnrc.yml"
nodeLinker: node-modules
enableGlobalCache: false
```
* **`nodeLinker: node-modules`:** Yarn Berry는 기본적으로 PnP(Plug'n'Play) 방식을 쓰지만, Docusaurus 플러그인 생태계와의 호환성 에러를 원천 차단하기 위해 강제로 기존 방식인 물리적 `node_modules` 디렉터리를 만들도록 지시합니다.
* **`enableGlobalCache: false`:** 패키지 압축 파일(`.zip`)들을 글로벌 캐시 경로가 아닌, 현재 프로젝트의 `.yarn/cache` 폴더 안에 강제 보관하게 합니다.

이 `.yarn/cache` 폴더를 Git에 그대로 커밋함으로써, GitHub Actions는 외부 다운로드 없이 로컬에 있는 `.zip` 파일의 압축만 해제하게 됩니다.

> **⏱️ 1단계 시간 단축 결과:** 
> * 패키지 준비 시간: 35초 ➔ 14초 (네트워크 Fetch 제거, 로컬 Unzip만 수행)
> * **총 빌드 시간: 70초 ➔ 49초 (▼ 21초 단축)**

---

## 🚀 2단계: CPU 연산 병목 돌파 (Rust 기반 컴파일러 도입)

패키지 준비 시간을 줄였으니, 다음은 빌드 엔진 자체의 속도를 올릴 차례입니다. 기존 Docusaurus 엔진인 Webpack(JS 기반)을 **멀티 스레딩이 가능한 Rust(러스트) 기반 차세대 엔진으로 교체**했습니다.

### 📝 적용 코드: `docusaurus.config.ts`
TypeScript 타입 에러를 무시하는 주석을 달고, 내부 초고속 엔진 옵션을 강제로 켰습니다.

```typescript title="docusaurus.config.ts"
const config: Config = {
  // ... 기존 설정 생략 ...

  // @ts-ignore : TS 타입 에러 무시 후 Rust 가속 엔진 강제 구동
  future: {
    experimental_faster: {
      swcJsLoader: true,           // [Babel 대체] React/TS 초고속 트랜스파일링
      swcJsMinimizer: true,        // [Terser 대체] JS 코드 난독화 및 압축
      swcHtmlMinimizer: true,      // HTML 공백/구조 초고속 압축
      lightningCssMinimizer: true, // [Cssnano 대체] CSS 벤더 프리픽스 및 압축
      rspackBundler: true,         // [Webpack 대체] 메인 번들링 엔진
    },
  },
};
```
* **`rspackBundler` (가장 핵심):** 무겁고 느린 Webpack 대신 ByteDance에서 만든 **Rspack**으로 번들러를 교체했습니다. Rust의 병렬 처리 능력을 이용해 수백 개의 파일을 엮는 시간을 비약적으로 줄입니다.
* **`swcJsLoader`:** 코드를 번역(Transpile)하던 Babel을 **SWC**로 교체하여 파싱 속도를 끌어올렸습니다.

> **⏱️ 2단계 시간 단축 결과:** 
> * 정적 컴파일 시간: 30초 ➔ 12초 (JS 엔진 ➔ Rust 엔진 전환)
> * **총 빌드 시간: 49초 ➔ 31초 (▼ 18초 추가 단축)**

---

## 🧠 3단계: 워크플로우 튜닝 (V8 GC 방어 및 Deep Cache)

마지막으로 GitHub Actions 구동 환경(VM)의 하드웨어 한계를 극복하기 위해 스크립트를 수정했습니다.

### 📝 적용 코드: `.github/workflows/deploy.yml`
Node.js 메모리 한계를 풀고, Docusaurus의 내부 컴파일 잔여물까지 완벽하게 캐싱하도록 세팅했습니다.

```yaml title=".github/workflows/deploy.yml"
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # 1. 빌드 엔진 튜닝: 프로덕션 소스맵 차단 및 V8 메모리 최대 확장
      GENERATE_SOURCEMAP: false
      NODE_OPTIONS: "--max_old_space_size=4096"
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1 # 전체 히스토리 대신 최신 커밋 1개만 Fetch

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # 2. Ultimate Deep Cache 타겟팅
      - name: Cache node_modules & Docusaurus build
        uses: actions/cache@v4
        with:
          path: |
            node_modules
            .docusaurus
            node_modules/.cache/webpack
          key: ${{ runner.os }}-docusaurus-ultimate-${{ hashFiles('yarn.lock', 'docusaurus.config.ts') }}-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-docusaurus-ultimate-${{ hashFiles('yarn.lock', 'docusaurus.config.ts') }}-
            ${{ runner.os }}-docusaurus-ultimate-
            
      - name: Install dependencies (Zero-Install)
        run: |
          corepack enable
          yarn install --immutable
```
* **V8 엔진 메모리 튜닝 (`NODE_OPTIONS`):** Node.js는 기본 메모리 한계(약 1.5GB)에 도달하면 가비지 컬렉션(GC)을 발생시키며 빌드를 버벅이게 만듭니다. 이를 4GB(`4096`)로 늘려 CPU가 빌드에만 집중하도록 만들고, 불필요한 `SOURCEMAP` 생성을 껐습니다.
* **Deep Cache 전략 (`actions/cache@v4`):** 패키지뿐만 아니라, 빌드 엔진이 만들어내는 핵심 임시 폴더(`.docusaurus`, `node_modules/.cache/webpack`)를 강제로 캐시에 묶어버렸습니다. 이로 인해 내용이 변경된 마크다운 파일만 부분적으로 컴파일하는 **완벽한 증분 빌드(Incremental Build)**가 완성되었습니다.

> **⏱️ 3단계 시간 단축 결과:** 
> * 인프라 오버헤드 및 재빌드 타임 축소: 10초 ➔ 2초 (Deep Cache Hit)
> * **최종 총 빌드 시간: 31초 ➔ 20초 대역 진입 (▼ 11초 추가 단축)**

---

## 🏁 최종 성과 지표 요약

세 번의 페이즈를 거친 최종 CI/CD 파이프라인의 성능 향상 폭입니다.

| 튜닝 단계 | 구간별 소요 시간 | 총 빌드 시간 | 최적화 핵심 기술 |
| :--- | :--- | :--- | :--- |
| **최초 상태** | Install (35s) + Build (30s) + Infra (5s) | **70초** | (As-Is) npm + Webpack |
| **Phase 1** | Install (14s) + Build (30s) + Infra (5s) | **49초** | Yarn v4 (Zero-install) 적용 |
| **Phase 2** | Install (14s) + Build (12s) + Infra (5s) | **31초** | Rspack & SWC (Rust) 엔진 전환 |
| **Phase 3** | Install (14s) + Build (4s) + Infra (2s) | **20초** | V8 메모리 튜닝 & Deep Cache 적용 |

결과적으로 **총 빌드 시간을 1분 10초에서 20초로 약 70% 단축**했습니다. 문서 변경 사항이 라이브 웹사이트에 배포되기까지의 딜레이가 획기적으로 줄어들어 매우 쾌적한 블로깅 환경을 구축할 수 있었습니다.