# DeepGuard Pro

**딥페이크·AI 생성 이미지 실시간 판별 플랫폼** 
(Gemini key 연결 시, 정확도가 높습니다. 디자인 보다 해당 부분을 신경 쓴 상태입니다. 추후 디자인 수정 예정.)

Google Gemini Vision AI와 로컬 픽셀 포렌식을 병렬 실행해 이중으로 판별합니다.  
빌드 도구 없이 Vanilla JS + Node.js만으로 구현한 풀스택 AI 응용 프로젝트입니다.
---

## 주요 기능

| 기능 | 설명 |
|---|---|
| **이중 AI 판별** | Gemini Vision API(의미 분석) + 로컬 픽셀 포렌식(물리 분석) 병렬 실행 |
| **영상 프레임 분석** | `requestVideoFrameCallback`으로 프레임 단위 딥페이크 탐지 |
| **캐시 최적화** | `파일명\|크기\|수정일` 조합의 SHA-256 해시로 동일 파일 재요청 시 Gemini API 호출 0회 |
| **관리자 대시보드** | 신고 모더레이션, 분석 이력 검색, 공지사항 관리 |
| **커뮤니티 공유** | 분석 결과 공유 링크 생성 및 커뮤니티 게시 |

---

## 기술 스택

| 레이어 | 기술 | 선택 이유 |
|---|---|---|
| **Frontend** | HTML5 (Canvas, File, Drag & Drop, Video API), Vanilla JS ES6+ | 빌드 도구 없이 브라우저 네이티브 API만으로 구현 — `npm run build` 없이 `node server.js` 한 줄로 실행 가능 |
| **멀티스레딩** | Web Worker API + Transferable Objects | 픽셀 포렌식 연산을 백그라운드 스레드로 분리해 분석 중 UI 블로킹 방지 |
| **암호화** | Web Crypto API (SHA-256) | 브라우저 내장 API로 외부 라이브러리 없이 파일 식별 해시 생성 |
| **Backend** | Node.js 18+, Express 4 | Gemini API 키를 서버에만 보관해 브라우저 소스코드 노출 차단; 프론트와 동일 언어(JS)로 풀스택 단일 언어 유지 |
| **AI 판별** | Google Gemini (`gemini-flash-latest`) Vision API | 무료 티어 제공, 멀티모달 Vision 지원, Chain-of-Thought 프롬프트로 단계별 추론 가능 |
| **로컬 포렌식** | Canvas 픽셀 분석 (CFA·GAN·조명·파일·기하학) | Gemini API 미설정 환경에서도 오프라인 판별 가능; API 호출 비용 없이 물리적 위변조 흔적 보완 탐지 |
| **상태 관리** | 자체 구현 Observable Store (빌드 도구 없는 Observer 패턴) | 번들러가 없어 React/Vue 등 npm 패키지를 프론트에서 직접 import 불가 — Observer 패턴을 Vanilla JS로 직접 구현 |
| **저장소** | In-memory Map (서버 재시작 시 초기화) | 교육·데모 목적의 프로젝트로 외부 DB 의존성 제거, 설치·실행 단순화 |

---

## 실행

```bash
npm install

# .env 생성
# GEMINI_API_KEY=AIza...
# ADMIN_PASSWORD=yourpw
# PORT=3001

node server.js
# → http://localhost:3001
```

서버 실행 후 브라우저에서 Gemini API 키를 입력하면 AI 판별이 활성화됩니다.

---

## 파일 구조

```
deepguard/
├── index.html              # 메인 분석 페이지
├── history.html            # 분석 기록
├── community.html          # 커뮤니티 공유
├── share.html              # 공유 링크 뷰어
├── admin.html              # 관리자 대시보드
├── admin-login.html        # 관리자 로그인
├── env.js                  # 클라이언트 환경 변수
├── server.js               # Express 서버 (API + 정적 파일 서빙)
├── css/
│   └── main.css            # 디자인 토큰 기반 CSS
└── js/
    ├── core.js             # Store, API 클라이언트, Toast, Modal
    ├── analysis.js         # 분석 엔진 UI 컨트롤러
    ├── analyzer.worker.js  # Web Worker — 픽셀 포렌식 실행
    ├── admin.js            # 관리자 패널 로직
    └── gemini-setup.js     # Gemini API 키 설정 UI
```

---

## 전체 분석 플로우

```
사용자 입력 (파일 / 이미지 / URL)
         │
         ▼
① 파일 지문 생성 (SHA-256)
   └─ 서버에 캐시 여부 확인
      ├─ 캐시 히트 → 이전 결과 즉시 반환 ──────────────────────┐
      └─ 캐시 없음 → 분석 시작                                 │

         ▼
② createImageBitmap() — 픽셀 디코딩
   ├─ 영상: requestVideoFrameCallback()으로 프레임 추출
   ├─ 이미지: File 객체 → ImageBitmap 변환
   └─ URL: 서버 프록시(/api/url-image-proxy)로 CORS 우회

         │
         ├────────────────────────────────────────┐
         ▼                                        ▼
③ Web Worker (별도 스레드)             ④ Gemini Vision API
   로컬 픽셀 포렌식                        (서버 경유 — API 키 보호)
   ├─ CFA 노이즈 매핑                    Chain-of-Thought 프롬프트
   ├─ 조명 비일관성                      → aiVerdict / aiConfidence
   ├─ GAN 체커보드 아티팩트              → deepfakeVerdict / deepfakeConfidence
   ├─ 파일 데이터 분석
   └─ 기하학 왜곡
         │                                        │
         └────────────────┬───────────────────────┘
                          ▼
                ⑤ 해상도 기반 가중치 결합 (adaptive weights)
                   shortSide ≤ 256px: Gemini 0.75, Local 0.25
                   shortSide ≥ 1024px: Gemini 0.55, Local 0.45
                   (그 사이: 선형 보간)

                          ▼
                ⑥ 판정 & 서버 저장 ◄────────────────────── ①(캐시 반환) ┘
                   FAKE / SUSPICIOUS / AUTHENTIC
```

**판정 기준** (입력 유형에 따라 임계값 분리)

| 입력 | FAKE 임계값 | SUSPICIOUS 임계값 | AUTHENTIC |
|---|---|---|---|
| 이미지 | 38% 이상 | 22 ~ 38% | 22% 미만 |
| 영상 | 55% 이상 | 32 ~ 55% | 32% 미만 |

> Gemini 판정이 있을 때는 `aiVerdict`/`deepfakeVerdict` 기반으로 verdict를 결정합니다. 강한 포렌식 신호가 감지되면 포렌식 점수로 오버라이드합니다. 오버라이드 조건은 세 가지 중 하나를 충족해야 합니다: ① 포렌식 종합 점수 0.45 이상 + 독립 모듈 2개 이상 강신호, ② CFA(해상도 보정 후) + 조명 점수가 동시에 0.60 이상, ③ 모듈 4개 이상이 동시에 강신호.

> **모듈별 강신호 임계값:** CFA(해상도 보정값 `cfaScoreEffective`) > **0.55**, 조명·GAN·파일·기하학 각 > **0.45**. CFA는 저해상도에서 `cfaTrust`로 보정된 유효값(`cfaScoreEffective`)을 사용하므로 원본 `cfaScore`와 다를 수 있습니다. CFA 단독 고점(JPEG 압축·리사이즈 왜곡 등)에 의한 오탐을 방지하기 위해 반드시 2개 이상의 독립 모듈이 동시에 임계값을 초과해야 합니다.

> **최종 verdict 값:** 분석 엔진(`analyzer.worker.js`)이 생성하는 verdict는 `FAKE` / `SUSPICIOUS` / `AUTHENTIC` 세 가지입니다. 단, 서버는 클라이언트가 POST로 전송한 verdict를 검증 없이 저장하므로(`server.js` `/api/analyses`), 외부 입력으로 `DEEPFAKE` 등 임의 값이 DB에 기록될 수 있습니다. 이 때문에 관리자 통계의 `fakeCount`는 `FAKE || DEEPFAKE`로 집계됩니다(`server.js:472`).

---

## 기술 상세

### 1. HTML5 Canvas API — 픽셀 직접 접근

`<canvas>`의 `getImageData()`는 브라우저에서 이미지 픽셀 데이터에 접근하는 유일한 방법입니다. 딥페이크 분석은 RGB 픽셀 값을 수학적으로 계산해야 하므로 Canvas가 필수입니다.

```js
// js/analyzer.worker.js
// OffscreenCanvas: 화면에 표시하지 않는 Worker 전용 Canvas
const sz = 192; // 192×192로 정규화 (분석 속도 vs 정확도 균형점)
const canvas = new OffscreenCanvas(sz, sz);
const ctx = canvas.getContext("2d");
ctx.drawImage(imageBitmap, 0, 0, sz, sz);

// ImageData.data = Uint8ClampedArray (0~255 범위 정수 배열)
// 픽셀 (x, y)의 R값 인덱스 = (y * width + x) * 4
// 배열 구조: [R, G, B, A, R, G, B, A, ...]
const { data } = ctx.getImageData(0, 0, sz, sz);
```

---

### 2. HTML5 Video API + requestVideoFrameCallback — 정확한 프레임 추출

`setInterval(fn, 33)`은 영상 재생 속도와 무관하게 실행되어 같은 프레임을 중복 처리하거나 건너뛸 수 있습니다. `requestVideoFrameCallback`은 새 프레임이 디코드된 직후 정확히 한 번 호출되어 프레임 낭비가 없습니다.

```js
// js/analysis.js
const SAMPLE_RATE = 6; // 6프레임마다 1회 분석 (30FPS 기준 초당 약 5프레임 처리)

function onFrame(now, metadata) {
  frameCount++;
  if (frameCount % SAMPLE_RATE !== 0) {
    scheduleFrame(); // 이 프레임은 건너뜀
    return;
  }
  // metadata.mediaTime: 영상 내 정확한 타임스탬프
  // videoEl.currentTime: 폴백 (구형 브라우저)
  const ts = metadata?.mediaTime ?? videoEl.currentTime;
  // 224×224로 캡처 후 Worker의 extractFeatures()에서 192×192로 다시 리사이즈해 분석
  createImageBitmap(videoEl, { resizeWidth: 224, resizeHeight: 224, resizeQuality: "medium" }).then(
    (bmp) => frameBuf.push({ imageBitmap: bmp, timestamp: ts }),
  );
  scheduleFrame();
}

function scheduleFrame() {
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype)
    rafId = videoEl.requestVideoFrameCallback(onFrame);
  else
    // 폴백: Safari 15.3 이하 등 미지원 브라우저
    rafId = requestAnimationFrame(() => onFrame(performance.now(), null));
}
```

---

### 3. Web Worker + Transferable — UI 블로킹 없는 병렬 연산

Worker는 메인 스레드와 독립된 백그라운드 스레드입니다. Worker에서 픽셀 포렌식을 실행하는 동안 UI(버튼 클릭, 스크롤)가 멈추지 않습니다.

`postMessage()`는 기본적으로 데이터를 Deep Copy합니다. `ImageBitmap`을 Transferable로 지정하면 복사 없이 소유권만 이전되어 메모리 절약과 성능이 동시에 개선됩니다.

```js
// js/analysis.js — 메인 스레드
const worker = new Worker("./js/analyzer.worker.js");

function flushBatch() {
  const batch = frameBuf.splice(0, BATCH_SIZE);

  // 두 번째 인자 = Transferable 목록 → 소유권 이전, 복사 없음
  worker.postMessage(
    { type: "ANALYZE", payload: { frames: batch } },
    batch.map((f) => f.imageBitmap),
  );
}

worker.onmessage = ({ data }) => {
  if (data.type === "FRAME_RESULT") updateLiveUI(data.payload);
  if (data.type === "ANALYSIS_COMPLETE") finalizeResult(data.payload);
};

// js/analyzer.worker.js — Worker 스레드
// switch 문으로 메시지 타입 분기, analyzeSegment가 배치 전체를 처리
self.onmessage = async ({ data: { type, payload } }) => {
  switch (type) {
    case "ANALYZE":
      await analyzeSegment(payload); // 내부에서 프레임별 FRAME_RESULT + 최종 ANALYSIS_COMPLETE 전송
      break;
  }
};

// analyzeSegment 내부 (요약)
async function analyzeSegment({ frames }) {
  const dfScores = [], aiScores = [], combined = [];
  let geminiResult = null;
  const isImage = frames.length === 1;
  const allSignals = [];

  // Gemini 호출을 먼저 Promise로 선발행 (최대 2개 프레임만)
  const gPs = [];
  for (let i = 0; i < Math.min(2, frames.length); i++) {
    const p = bitmapToBase64(frames[i].imageBitmap);
    gPs.push(
      p.then(b64 => callServerAI(b64, !isImage))
       .catch(() => null) // 실패 시 null로 대체 — 로컬 결과로 계속 진행
    );
  }

  for (let i = 0; i < frames.length; i++) {
    const { imageBitmap, frameIndex, timestamp } = frames[i];
    const hS = extractFeatures(imageBitmap);           // 로컬 포렌식
    allSignals.push(hS._signals);
    let serverAI = null;
    if (i < gPs.length) {
      serverAI = await gPs[i];                         // Gemini (실패 시 null)
      if (i === 0) geminiResult = serverAI;
    }
    const scores = blend(hS, serverAI);                // 가중치 결합
    const cS = Math.max(scores.df, scores.ai);         // df·ai 중 높은 값 사용
    dfScores.push(scores.df); aiScores.push(scores.ai); combined.push(cS);
    imageBitmap.close();                               // GPU 메모리 즉시 해제
    postMessage({ type: "FRAME_RESULT", payload: {
      confidence: cS, dfConfidence: scores.df, aiConfidence: scores.ai,
      smoothedConfidence: smooth(combined, WINDOW_SIZE),
      frameIndex, timestamp, progress: (i + 1) / frames.length,
      geminiActive: !!serverAI, forensicSignals: hS._signals,
    }});
    if (i % 8 === 0) await new Promise(r => setTimeout(r, 0)); // UI 양보
  }
  postMessage({ type: "ANALYSIS_COMPLETE", payload: { verdict, avgConfidence, ... } });
}
```

---

### 4. 로컬 픽셀 포렌식 5대 모듈 (`js/analyzer.worker.js`)

#### 4-1. CFA 노이즈 매핑

실제 카메라 센서는 RGGB 배열(Bayer Pattern)로 빛을 기록하고 나머지 색을 주변 픽셀로 보간합니다. 이 과정에서 인접 픽셀 간 통계적 상관관계가 생깁니다. AI 이미지는 픽셀을 처음부터 직접 생성하므로 이 패턴이 없거나 비정상적입니다.

```js
// js/analyzer.worker.js
function analyzeCFANoise(d, sz) {
  const halfSz = Math.floor(sz / 2);
  let rNoiseSum = 0, gNoiseSum = 0, bNoiseSum = 0;
  let rgCross = 0, rbCross = 0, bayerResidual = 0;

  for (let y = 0; y < halfSz - 1; y++) {
    for (let x = 0; x < halfSz - 1; x++) {
      const coords = [
        [y * 2, x * 2], [y * 2, x * 2 + 1],
        [y * 2 + 1, x * 2], [y * 2 + 1, x * 2 + 1],
      ];
      const rv = coords.map(([py, px]) => d[(py * sz + px) * 4]);
      const gv = coords.map(([py, px]) => d[(py * sz + px) * 4 + 1]);
      const bv = coords.map(([py, px]) => d[(py * sz + px) * 4 + 2]);

      const rM = rv.reduce((a, b) => a + b, 0) / 4;
      const gM = gv.reduce((a, b) => a + b, 0) / 4;
      const bM = bv.reduce((a, b) => a + b, 0) / 4;

      // 채널별 분산 누산 (cfaRatio = (rNoise + bNoise) / (2 * gNoise) 계산에 사용)
      rNoiseSum += rv.reduce((a, v) => a + (v - rM) ** 2, 0) / 4;
      gNoiseSum += gv.reduce((a, v) => a + (v - gM) ** 2, 0) / 4;
      bNoiseSum += bv.reduce((a, v) => a + (v - bM) ** 2, 0) / 4;

      const rD = rv.map(v => v - rM);
      const gD = gv.map(v => v - gM);
      const bD = bv.map(v => v - bM);

      // R-G, R-B 교차 상관: 실제 카메라 → 낮음(채널 독립), AI 생성 → 높음(동시 변동)
      rgCross += rD.reduce((a, v, i) => a + v * gD[i], 0) / 4;
      rbCross += rD.reduce((a, v, i) => a + v * bD[i], 0) / 4;

      // Bayer 잔차: 대각 G픽셀 쌍의 합 차이 (실제 카메라 → 거의 0)
      const g00 = d[(y * 2 * sz + x * 2) * 4 + 1];
      const g11 = d[((y * 2 + 1) * sz + x * 2 + 1) * 4 + 1];
      const g01 = d[(y * 2 * sz + x * 2 + 1) * 4 + 1];
      const g10 = d[((y * 2 + 1) * sz + x * 2) * 4 + 1];
      bayerResidual += Math.abs(g00 + g11 - (g01 + g10));
    }
  }
  const blocks = (halfSz - 1) * (halfSz - 1) || 1;
  // cfaRatio: R·B 노이즈가 G 노이즈 대비 얼마나 균등한지 (실제 카메라 ≈ 1.0)
  const cfaRatio = gNoiseSum > 0 ? (rNoiseSum + bNoiseSum) / (2 * gNoiseSum) : 1;
  const crossCorr = Math.abs(rgCross / blocks + rbCross / blocks) / (Math.max(rNoiseSum / blocks, 1) * 2);
  const normBayer = bayerResidual / (blocks * 255 * 2);
  const cfaScore = Math.max(0, Math.min(1,
    (1 - Math.min(1, Math.abs(cfaRatio - 1.0) / 0.5)) * 0.5
    + crossCorr * 0.3
    + (1 - normBayer * 10) * 0.2
  ));
  return { cfaScore, cfaRatio, crossCorr, normBayer };
}
```

#### 4-2. GAN 체커보드 아티팩트 탐지

GAN이 저해상도 Feature Map을 업샘플링할 때 Transposed Convolution(`ConvTranspose`)을 사용합니다. 이 연산은 인접 픽셀이 커널과 겹치는 횟수가 달라지는 현상을 일으켜, 2×2 격자로 밝기가 교대로 높고 낮아지는 체스판 패턴이 생깁니다.

```js
function analyzeGANPixels(d, sz) {
  // 1. 픽셀 밝기 홀짝 편향 (even-odd bias)
  const hist = new Int32Array(256);
  for (let i = 0; i < d.length; i += 4)
    hist[Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114)]++;
  let even = 0, odd = 0;
  for (let v = 0; v < 256; v++) v % 2 === 0 ? even += hist[v] : odd += hist[v];
  const evenOddBias = Math.abs(even / (sz*sz) - 0.5) * 2;

  // 2. 2×2 체커보드 패턴 — 대각 픽셀 쌍의 밝기 합 차이
  let checkerSum = 0;
  for (let y = 0; y < sz - 2; y += 2) {
    for (let x = 0; x < sz - 2; x += 2) {
      const g = [[y*sz+x], [y*sz+(x+1)], [(y+1)*sz+x], [(y+1)*sz+(x+1)]]
        .map(([idx]) => d[idx*4]*0.299 + d[idx*4+1]*0.587 + d[idx*4+2]*0.114);
      checkerSum += Math.abs((g[0]+g[3]) - (g[1]+g[2])); // 대각 합 차이
    }
  }
  const checkerArtifact = checkerSum / (sz/2 * sz/2 * 255 * 2);

  const ganScore = Math.max(0, Math.min(1,
    evenOddBias * 0.20 + checkerArtifact * 8 * 0.25 +
    (blockBoundary < 0.01 ? 0.30 : blockBoundary < 0.02 ? 0.10 : 0) * 0.25 +
    (1 - radialEnt) * 0.30
  ));
  return { ganScore, evenOddBias, checkerArtifact, blockBoundary, radialEnt };
}
```

#### 4-3. 조명 비일관성 분석

이미지를 4×4 = 16개 구역으로 분할해 각 구역의 평균 밝기와 하이라이트(RGB 모두 240 이상인 픽셀) 비율을 계산합니다. 하이라이트가 가장 많은 구역의 행(row)과 전체 평균 밝기가 가장 높은 구역의 행이 일치하지 않으면 조명 비일관성 신호로 판단합니다. 추가로 수직 밝기 기울기(상단 행 평균 − 하단 행 평균)와 그림자 방향 일관성도 함께 반영합니다.

#### 4-4. 파일 데이터 포렌식 (`analyzeFileDataProxy`)

비네팅, Poisson 노이즈, 코너-센터 분산비를 하나의 함수에서 함께 계산해 `fileScore`로 반환합니다.

**비네팅(Vignetting):** 실제 카메라 렌즈는 광학적 특성으로 이미지 중앙보다 가장자리가 자연스럽게 어둡습니다. AI 생성 이미지는 이 어두워짐이 없거나 비정상적으로 균등합니다.

```js
// js/analyzer.worker.js
// center / (edge + 1) 비율로 중앙 대비 주변부 밝기 편차 측정
const vigR = (cB / cC) / (eB / eC + 1);
// vigR < 1.03: 비네팅 없음 → AI 판정 가능성 높음 (0.35점)
// vigR < 1.05: 비네팅 약함 → AI 판정 가능성 중간 (0.15점)
```

#### 4-5. 기하학 왜곡 분석

수평 스캔라인 기울기 자기상관(`lineCons`), 에지 방향 엔트로피(`angleEntropy`), 8×8 블록 간 밝기 매끄러움(`blockSmooth`) 세 지표를 계산합니다. AI 생성 이미지는 에지 방향이 지나치게 균등하거나(엔트로피 높음) 블록 경계가 과도하게 매끄러운 경향이 있습니다.

---

### 5. 해상도 기반 적응형 가중치 결합

단순 고정 가중치 대신, 이미지 해상도에 따라 Gemini와 로컬 포렌식의 기여 비율을 동적으로 조절합니다. 저해상도 이미지는 Gemini의 의미 분석에 더 의존하고, 고해상도 이미지는 물리적 흔적이 더 뚜렷하므로 로컬 포렌식 비중을 높입니다.

```js
// js/analyzer.worker.js
function computeAdaptiveWeights(origWidth, origHeight) {
  const shortSide = Math.min(origWidth || 192, origHeight || 192);
  const lo = 256, hi = 1024;
  const t = Math.max(0, Math.min(1, (shortSide - lo) / (hi - lo)));
  const geminiW = 0.75 - t * 0.20; // 256px이하: 0.75, 1024px이상: 0.55
  return { localW: 1 - geminiW, geminiW };
}

// 최종 점수 = geminiScore * geminiW + localScore * localW
```

| 해상도 | Gemini 가중치 | 로컬 포렌식 가중치 | 이유 |
|---|---|---|---|
| 256px 이하 | 0.75 | 0.25 | 저해상도는 픽셀 단서가 적어 AI 맥락 분석 의존 |
| 1024px 이상 | 0.55 | 0.45 | 고해상도는 CFA·GAN 흔적이 명확히 탐지 가능 |
| 그 사이 | 선형 보간 | 선형 보간 | 해상도에 비례한 부드러운 전환 |

---

### 6. Web Crypto API — 파일 식별 지문

SHA-256은 어떤 입력이든 256비트(64자리 16진수) 고정 해시로 변환하는 단방향 함수입니다. 파일 전체 대신 `파일명|크기|수정일` 조합을 해시해 수백 MB 영상도 즉시 식별합니다.

```js
// js/core.js
async function computeSHA256(file, onProgress) {
  // 파일 전체를 읽지 않고 메타데이터만으로 식별 문자열 생성
  const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  );

  // ArrayBuffer → 16진수 문자열 변환
  // padStart(2, '0'): 한 자리 16진수 앞에 0 추가 ('a' → '0a')
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**캐시 흐름:**
```
동일 파일 재분석 요청
      ↓
해시 생성 → GET /api/analyses?hash=a1b2c3...
      ↓
캐시 있음 → 이전 결과 즉시 반환  (Gemini API 호출 0회)
캐시 없음 → 전체 분석 실행
```

---

### 7. Observable Store — 빌드 도구 없는 상태 관리

번들러(Webpack/Vite)가 없으므로 npm 패키지를 프론트엔드에서 직접 import할 수 없습니다. React `useState`와 유사한 Observer 패턴을 Vanilla JS로 직접 구현했습니다.

```js
// js/core.js
const Store = (() => {
  const _state = {
    currentPage: 'analyze',
    analysis: {
      file: null,
      hash: null,
      hashStatus: 'idle',       // idle | hashing | checking | cached | new
      hashProgress: 0,
      analysisStatus: 'idle',   // idle | ready | analyzing | complete | error
      analysisProgress: 0,
      frameResults: [],
      overallResult: null,
      suspiciousScreenshots: [],
      liveConfidence: 0,
      frameCount: 0,
    },
    admin:      { user: null, token: null, role: null },
    community:  { reports: [], total: 0, page: 1 },
    moderation: { reports: [], total: 0, statusFilter: 'PENDING', page: 1 },
    hashSearch: {
      results: [], total: 0, page: 1,
      filters: { q: '', verdict: '', dateFrom: '', dateTo: '' },
    },
  };
  const listeners = {};

  return {
    get(key) { return key ? _state[key] : _state; },

    set(key, patch) {
      // 객체면 shallow merge, 아니면 전체 교체
      if (typeof patch === "object" && !Array.isArray(patch))
        Object.assign(_state[key], patch);
      else _state[key] = patch;

      (listeners[key] || []).forEach((fn) => fn(_state[key]));
      (listeners['*']  || []).forEach((fn) => fn(_state));   // 전체 구독자에도 브로드캐스트
    },

    // 구독 등록 — 반환 함수 호출로 구독 해제 (메모리 누수 방지)
    // key='*' 로 전체 상태 변경 구독 가능
    on(key, fn) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(fn);
      return () => {
        listeners[key] = listeners[key].filter((f) => f !== fn);
      };
    },
  };
})();

// 사용 예: 분석 상태 변경 시 UI 자동 갱신 (analysis.js 실제 사용 패턴)
const unsub = Store.on("analysis", (state) => {
  if (state.analysisStatus === "ready") {
    unsub(); // 조건 충족 후 구독 해제
    doAnalyze();
  }
});

Store.set("analysis", { liveConfidence: 0.72, frameCount: 45 });
// → 구독 중인 모든 콜백 자동 실행 → UI 즉시 반영
```

---

### 8. Express 서버 + CORS 프록시

API 키를 서버에만 보관해 브라우저 소스코드에 노출되지 않도록 합니다. 이미지 데이터는 분석을 위해 서버를 경유해 Gemini로 전달됩니다.

```js
// server.js
app.use(express.static(__dirname)); // HTML/CSS/JS 정적 파일 서빙

// Gemini Vision 분석 — API 키 서버에서만 사용
// isFrame: true이면 영상 프레임용 프롬프트(VIDEO_FRAME_PROMPT), false이면 이미지용(IMAGE_PROMPT)
app.post("/api/ai-detect/image", async (req, res) => {
  const { imageBase64, mimeType = "image/jpeg", isFrame = false } = req.body;
  const result = await callGemini([
    { inlineData: { mimeType, data: imageBase64 } },
    { text: isFrame ? VIDEO_FRAME_PROMPT : IMAGE_PROMPT },
  ]);
  res.json(sanitizeResult(result));
});

// CORS 프록시: 브라우저 → 우리 서버 → 외부 URL → Base64 반환
// (서버는 Same-Origin Policy 적용 없음)
app.get("/api/url-image-proxy", async (req, res) => {
  const response = await fetch(req.query.url);
  const buffer = await response.arrayBuffer();
  res.json({
    base64: Buffer.from(buffer).toString("base64"),
    mimeType: response.headers.get("content-type"),
  });
});
```

---

### 9. Gemini Chain-of-Thought 프롬프트

"딥페이크냐?"라고 단순히 묻는 대신, 단계별 추론을 요구해 판단 정확도를 높입니다. 프롬프트는 한국어로 작성되어 있으며, 이미지용(`IMAGE_PROMPT`)과 영상 프레임용(`VIDEO_FRAME_PROMPT`) 두 가지로 분리됩니다.

```js
// server.js — IMAGE_PROMPT (요약)
const IMAGE_PROMPT = `당신은 최고 수준의 시각 포렌식 및 AI/딥페이크 탐지 전문 시스템입니다.

[분석 지침 (Chain of Thought)]
결론을 내리기 전에, 아래 단계에 따라 시각적 단서를 꼼꼼히 역추적하세요:
1. 조명 및 반사: 눈동자의 인공적 하이라이트 비대칭성, 그림자의 방향이 광원과 일치하는지?
2. 해부학 및 인체 구조: 손가락 형태와 개수, 치아 크기/배열, 귀의 복잡한 구조가 자연스러운지?
3. 텍스처 및 결합: 피부가 플라스틱처럼 지나치게 매끈한지, 배경 피사체가 이상하게 융합되었는지?
4. 딥페이크 특화 신호: 얼굴 경계선(턱선, 헤어라인) 부근의 해상도 저하나 비정상적인 블러링 처리 유무.

반드시 아래 JSON 형식으로만 최종 응답 (마크다운/백틱 없이):
{
  "analysisSteps": ["광원 분석: ...", "해부학 분석: ...", "텍스처 및 딥페이크 흔적: ..."],
  "aiVerdict":          "AI_GENERATED" | "LIKELY_AI" | "UNCERTAIN" | "LIKELY_REAL" | "AUTHENTIC",
  "aiConfidence":       0~100,
  "aiCategory":         "Diffusion 모델" | "GAN 생성" | "딥페이크 합성" | "실제 사진" | "편집된 사진" | "불분명",
  "aiSignals":          ["구체적인 의심 신호 1", "의심 신호 2"],
  "aiReasoning":        "최종 판단 근거 (한국어 150자 이내)",
  "deepfakeVerdict":    "DEEPFAKE" | "LIKELY_DEEPFAKE" | "UNCERTAIN" | "AUTHENTIC",
  "deepfakeConfidence": 0~100
}`;
```

영상 프레임용(`VIDEO_FRAME_PROMPT`)은 얼굴 합성 특화 지침(안면 경계선, 이목구비 왜곡, 노이즈 분포)으로 구성되며 JSON 구조는 동일합니다.

```js
// Gemini 응답 후처리: 마크다운 코드블록 제거 후 파싱
text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
const parsed = JSON.parse(text);
```

---

## 문제 해결 기록

### 문제 1: Gemini 응답 JSON 파싱 실패

**원인:** Gemini가 JSON 앞뒤에 마크다운 코드블록(`` ```json ... ``` ``)을 붙여 반환합니다.

```js
// 실패: "```json\n{\"aiVerdict\": ...}\n```" → JSON.parse() SyntaxError

// 해결: 정규식으로 코드블록 펜스 제거 후 파싱
text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
const parsed = JSON.parse(text);
```

---

### 문제 2: Web Worker ImageBitmap 전달 시 성능 저하

**원인:** `postMessage()` 기본 동작은 Deep Copy입니다. 224×224 × 4바이트 × 배치 16개 ≈ 3.06MB를 매 배치마다 복사합니다.

```js
// 문제: 기본 전달 → 전체 데이터 복사
worker.postMessage({ frames: batch });

// 해결: Transferable 지정 → 소유권 이전, 복사 0
worker.postMessage(
  { type: "ANALYZE", payload: { frames: batch } },
  batch.map((f) => f.imageBitmap),
);
```

---

### 문제 3: Worker 분석 후 메모리 누수

**원인:** Transferable로 이전된 `ImageBitmap`은 Worker가 소유합니다. 분석 후 `close()`를 명시적으로 호출하지 않으면 GPU 메모리가 즉시 해제되지 않습니다.

```js
// js/analyzer.worker.js — analyzeSegment 내부
for (let i = 0; i < frames.length; i++) {
  const { imageBitmap } = frames[i];
  extractFeatures(imageBitmap); // 분석
  imageBitmap.close();          // GPU 메모리 즉시 해제 (best practice)
  postMessage({ type: "FRAME_RESULT", payload: { ... } });
}
```

---

### 문제 4: 외부 URL 이미지 Canvas 접근 차단 (Tainted Canvas)

**원인:** Same-Origin Policy로 외부 도메인 이미지를 Canvas에 그리면 `getImageData()` 호출 시 `SecurityError`가 발생합니다.

```
브라우저 → Canvas.drawImage(외부이미지) → getImageData()
→ SecurityError: The canvas has been tainted by cross-origin data
```

```js
// 해결: 서버 프록시로 중계 — 서버는 CORS 제약 없음
// 브라우저 → 우리 서버 → 외부 URL → Base64 → 브라우저 Canvas (동일 출처)
const { base64, mimeType } = await fetch(`/api/url-image-proxy?url=${encodeURIComponent(url)}`).then(r => r.json());
const dataUrl = `data:${mimeType};base64,${base64}`;
```

---

### 문제 5: requestVideoFrameCallback 미지원 브라우저

**원인:** Safari 15.3 이하 등 구버전에서 API가 없습니다.

```js
// 기능 감지(Feature Detection) 패턴 — 런타임에 존재 여부 확인
if ("requestVideoFrameCallback" in HTMLVideoElement.prototype)
  rafId = videoEl.requestVideoFrameCallback(onFrame); // 정확한 프레임 타이밍
else
  rafId = requestAnimationFrame(() => onFrame(performance.now(), null)); // 폴백
```

---

## 관리자 기능

| 기능 | 설명 |
|---|---|
| 신고 모더레이션 | 신고 상태(신고됨·활성·삭제됨)별 필터링, 게시물 강제 삭제 |
| 분석 이력 검색 | SHA-256·파일명·판별결과·날짜로 검색 |
| 실시간 신고 알림 | 30초 폴링으로 신규 신고 발생 시 벨 알림 |
| 공지사항 | 커뮤니티 공지 등록·고정·삭제 |

---

## 면책 조항

본 소프트웨어는 교육·연구·보안 목적으로 제공됩니다.  
AI 기반 판별 결과는 참고용이며 법적 효력을 갖지 않습니다.  
실제 법적 판단을 위해서는 반드시 공인 디지털 포렌식 전문가의 검토가 필요합니다.
