/**
 * DeepGuard Pro v4 — Analysis Worker (Enhanced Forensics)
 * 추가된 분석 모듈:
 *   1. CFA 노이즈 매핑  2. 조명 메타데이터  3. GAN 픽셀 검사
 *   4. 이진 파일 데이터 분석  5. 기하학 노이즈 매핑
 */

const WINDOW_SIZE = 7;

// 동적 로컬 포렌식 가중치 및 판정 임계값 설정
let CONFIG = {
  cfa: 0.25,
  lighting: 0.18,
  gan: 0.20,
  file: 0.17,
  geo: 0.15,
  
  cfaDf: 0.22,
  lightingDf: 0.18,
  ganDf: 0.18,
  fileDf: 0.17,
  geoDf: 0.17,
  
  imageFakeThreshold: 0.38,
  imageSuspiciousThreshold: 0.22,
  videoFakeThreshold: 0.55,
  videoSuspiciousThreshold: 0.32,
};

/* ── MODULE 1: CFA 노이즈 매핑 ─────────────────────────── */
function analyzeCFANoise(d, sz) {
  const halfSz = Math.floor(sz / 2);
  let rNoiseSum=0, gNoiseSum=0, bNoiseSum=0, rgCross=0, rbCross=0, bayerResidual=0;
  for (let y=0; y<halfSz-1; y++) {
    for (let x=0; x<halfSz-1; x++) {
      const coords=[[y*2,x*2],[y*2,x*2+1],[y*2+1,x*2],[y*2+1,x*2+1]];
      const rv=coords.map(([py,px])=>d[(py*sz+px)*4]);
      const gv=coords.map(([py,px])=>d[(py*sz+px)*4+1]);
      const bv=coords.map(([py,px])=>d[(py*sz+px)*4+2]);
      const rM=rv.reduce((a,b)=>a+b,0)/4, gM=gv.reduce((a,b)=>a+b,0)/4, bM=bv.reduce((a,b)=>a+b,0)/4;
      const rV=rv.reduce((a,v)=>a+(v-rM)**2,0)/4;
      const gV=gv.reduce((a,v)=>a+(v-gM)**2,0)/4;
      const bV=bv.reduce((a,v)=>a+(v-bM)**2,0)/4;
      rNoiseSum+=rV; gNoiseSum+=gV; bNoiseSum+=bV;
      const rD=rv.map(v=>v-rM), gD=gv.map(v=>v-gM), bD=bv.map(v=>v-bM);
      rgCross+=rD.reduce((a,v,i)=>a+v*gD[i],0)/4;
      rbCross+=rD.reduce((a,v,i)=>a+v*bD[i],0)/4;
      const g00=d[(y*2*sz+x*2)*4+1],g11=d[((y*2+1)*sz+x*2+1)*4+1];
      const g01=d[(y*2*sz+x*2+1)*4+1],g10=d[((y*2+1)*sz+x*2)*4+1];
      bayerResidual+=Math.abs((g00+g11)-(g01+g10));
    }
  }
  const blocks=(halfSz-1)*(halfSz-1)||1;
  const cfaRatio=gNoiseSum>0?(rNoiseSum+bNoiseSum)/(2*gNoiseSum):1;
  const crossCorr=Math.abs(rgCross/blocks+rbCross/blocks)/(Math.max(rNoiseSum/blocks,1)*2);
  const normBayer=bayerResidual/(blocks*255*2);
  const cfaScore=Math.max(0,Math.min(1,
    (1-Math.min(1,Math.abs(cfaRatio-1.0)/0.5))*0.5+crossCorr*0.3+(1-normBayer*10)*0.2));
  return {cfaScore,cfaRatio,crossCorr,normBayer};
}

/* ── MODULE 2: 조명 메타데이터 분석 ────────────────────── */
function analyzeLighting(d, sz) {
  const rs=Math.floor(sz/4);
  const rb=[];
  for (let ry=0;ry<4;ry++) for (let rx=0;rx<4;rx++) {
    let sum=0,cnt=0;
    for (let y=ry*rs;y<Math.min(sz,(ry+1)*rs);y++)
      for (let x=rx*rs;x<Math.min(sz,(rx+1)*rs);x++) {
        const i=(y*sz+x)*4; sum+=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; cnt++;
      }
    rb.push(sum/cnt/255);
  }
  const topRow=rb.slice(0,4).reduce((a,b)=>a+b,0)/4;
  const botRow=rb.slice(12,16).reduce((a,b)=>a+b,0)/4;
  const vertGrad=topRow-botRow;
  const highlights=new Array(16).fill(0);
  for (let ry=0;ry<4;ry++) for (let rx=0;rx<4;rx++) {
    let cnt=0,hc=0;
    for (let y=ry*rs;y<Math.min(sz,(ry+1)*rs);y++)
      for (let x=rx*rs;x<Math.min(sz,(rx+1)*rs);x++) {
        const i=(y*sz+x)*4;
        if(d[i]>240&&d[i+1]>240&&d[i+2]>240) hc++;
        cnt++;
      }
    highlights[ry*4+rx]=hc/cnt;
  }
  const maxHL=Math.max(...highlights);
  const maxHLR=Math.floor(highlights.indexOf(maxHL)/4);
  const maxBR=Math.floor(rb.indexOf(Math.max(...rb))/4);
  const lightInconsistency=Math.abs(maxHLR-maxBR)/3;
  const darkRegs=rb.map(b=>b<0.3?1:0);
  const darkTop=darkRegs.slice(0,4).reduce((a,b)=>a+b,0);
  const darkBot=darkRegs.slice(12,16).reduce((a,b)=>a+b,0);
  const shadowCons=vertGrad>0.05?(darkBot>darkTop?1:0):vertGrad<-0.05?(darkTop>darkBot?1:0):0.5;
  const lightingScore=Math.max(0,Math.min(1,
    lightInconsistency*0.4+(1-shadowCons)*0.3+(maxHL>0.15?0.3:0)));
  return {lightingScore,vertGrad,lightInconsistency,shadowCons};
}

/* ── MODULE 3: GAN 픽셀 검사 ───────────────────────────── */
function analyzeGANPixels(d, sz) {
  const hist=new Int32Array(256);
  for (let i=0;i<d.length;i+=4) hist[Math.round(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)]++;
  const n=sz*sz;
  let even=0,odd=0;
  for (let v=0;v<256;v++) v%2===0?even+=hist[v]:odd+=hist[v];
  const evenOddBias=Math.abs(even/n-0.5)*2;

  let checkerSum=0;
  for (let y=0;y<sz-2;y+=2) for (let x=0;x<sz-2;x+=2) {
    const g=([[(y)*sz+(x)],[(y)*sz+(x+1)],[(y+1)*sz+(x)],[(y+1)*sz+(x+1)]]).map(([idx])=>d[idx*4]*0.299+d[idx*4+1]*0.587+d[idx*4+2]*0.114);
    checkerSum+=Math.abs((g[0]+g[3])-(g[1]+g[2]));
  }
  const checkerArtifact=checkerSum/(sz/2*sz/2*255*2);

  let bbScore=0;
  for (let y=8;y<sz-8;y+=8) for (let x=0;x<sz;x++) {
    const a=d[((y-1)*sz+x)*4]*0.299+d[((y-1)*sz+x)*4+1]*0.587+d[((y-1)*sz+x)*4+2]*0.114;
    const b=d[(y*sz+x)*4]*0.299+d[(y*sz+x)*4+1]*0.587+d[(y*sz+x)*4+2]*0.114;
    bbScore+=Math.abs(a-b);
  }
  const blockBoundary=bbScore/(Math.floor(sz/8)*sz*255);

  const cx=sz/2,cy=sz/2,maxR=sz/2;
  const rBins=new Float32Array(16),rCnt=new Int32Array(16);
  for (let y=0;y<sz;y++) for (let x=0;x<sz;x++) {
    const bin=Math.min(15,Math.floor(Math.sqrt((x-cx)**2+(y-cy)**2)/maxR*16));
    rBins[bin]+=d[(y*sz+x)*4]*0.299+d[(y*sz+x)*4+1]*0.587+d[(y*sz+x)*4+2]*0.114;
    rCnt[bin]++;
  }
  let radialEnt=0;
  for (let i=0;i<16;i++){const p=(rCnt[i]>0?rBins[i]/rCnt[i]/255:0.001+0.001)/17;radialEnt-=p*Math.log2(p);}
  radialEnt/=4;

  const ganScore=Math.max(0,Math.min(1,
    evenOddBias*0.20+checkerArtifact*8*0.25+(blockBoundary<0.01?0.30:blockBoundary<0.02?0.10:0)*0.25+(1-radialEnt)*0.30));
  return {ganScore,evenOddBias,checkerArtifact,blockBoundary,radialEnt};
}

/* ── MODULE 4: 이진 파일 데이터 분석 ───────────────────── */
function analyzeFileDataProxy(d, sz) {
  const margin=Math.floor(sz*0.1);
  let cornerVar=0;
  for (const [y0,y1,x0,x1] of [[0,margin,0,margin],[0,margin,sz-margin,sz],[sz-margin,sz,0,margin],[sz-margin,sz,sz-margin,sz]]) {
    let s=0,sq=0,cnt=0;
    for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++) {
      const v=d[(y*sz+x)*4]*0.299+d[(y*sz+x)*4+1]*0.587+d[(y*sz+x)*4+2]*0.114;
      s+=v;sq+=v*v;cnt++;
    }
    const m=s/cnt;cornerVar+=(sq/cnt-m*m);
  }
  cornerVar/=4;
  let s2=0,sq2=0,cnt2=0;
  const cw=sz/4,ch=sz/2;
  for (let y=ch-cw;y<ch+cw;y++) for (let x=ch-cw;x<ch+cw;x++) {
    if(y<0||y>=sz||x<0||x>=sz)continue;
    const v=d[(y*sz+x)*4]*0.299+d[(y*sz+x)*4+1]*0.587+d[(y*sz+x)*4+2]*0.114;
    s2+=v;sq2+=v*v;cnt2++;
  }
  const cm=s2/cnt2, centerVar=sq2/cnt2-cm*cm;
  const ccr=centerVar>0?cornerVar/centerVar:1;

  let poissonCorr=0,poissonN=0;
  for (let y=0;y<sz-8;y+=8) for (let x=0;x<sz-8;x+=8) {
    let bs=0,bsq=0;
    for (let dy=0;dy<8;dy++) for (let dx=0;dx<8;dx++) {
      const v=d[((y+dy)*sz+(x+dx))*4]*0.299+d[((y+dy)*sz+(x+dx))*4+1]*0.587+d[((y+dy)*sz+(x+dx))*4+2]*0.114;
      bs+=v;bsq+=v*v;
    }
    const bm=bs/64,bv=Math.max(0,bsq/64-bm*bm);
    if(bm>20&&bm<235){poissonCorr+=(bv>bm*0.3?1:-1);poissonN++;}
  }
  const poissonScore=poissonN>0?poissonCorr/poissonN:0;

  let cB=0,eB=0,cC=0,eC=0;
  const iR=sz*0.25,oR=sz*0.45;
  for (let y=0;y<sz;y++) for (let x=0;x<sz;x++) {
    const r=Math.sqrt((x-sz/2)**2+(y-sz/2)**2);
    const v=d[(y*sz+x)*4]*0.299+d[(y*sz+x)*4+1]*0.587+d[(y*sz+x)*4+2]*0.114;
    if(r<iR){cB+=v;cC++;}
    if(r>oR&&r<sz*0.5){eB+=v;eC++;}
  }
  const vigR=(cC>0&&eC>0)?(cB/cC)/(eB/eC+1):1;

  const fileScore=Math.max(0,Math.min(1,
    (1-Math.min(1,Math.abs(ccr-1.2)/0.8))*0.3+(poissonScore<-0.3?0.35:poissonScore<0?0.15:0)+(vigR<1.03?0.35:vigR<1.05?0.15:0)));
  return {fileScore,cornerCenterRatio:ccr,poissonScore,vignetteRatio:vigR};
}

/* ── MODULE 5: 기하학 노이즈 매핑 ──────────────────────── */
function analyzeGeometricNoise(d, sz) {
  const sStep=Math.floor(sz/16);
  let lineCons=0;
  for (let y=sStep;y<sz-sStep;y+=sStep) {
    const lg=[];
    for (let x=1;x<sz-1;x++) {
      const a=d[((y-1)*sz+x)*4]*0.299+d[((y-1)*sz+x)*4+1]*0.587+d[((y-1)*sz+x)*4+2]*0.114;
      const b=d[((y+1)*sz+x)*4]*0.299+d[((y+1)*sz+x)*4+1]*0.587+d[((y+1)*sz+x)*4+2]*0.114;
      lg.push(Math.abs(a-b));
    }
    let ac=0;
    for (let i=0;i<lg.length-1;i++) ac+=lg[i]*lg[i+1];
    lineCons+=ac/(lg.reduce((a,b)=>a+b**2,0)+1);
  }
  lineCons/=Math.floor(sz/sStep)||1;

  const aHist=new Float32Array(18);
  for (let y=1;y<sz-1;y+=2) for (let x=1;x<sz-1;x+=2) {
    const dx=(d[(y*sz+x+1)*4]-d[(y*sz+x-1)*4])*0.299+(d[(y*sz+x+1)*4+1]-d[(y*sz+x-1)*4+1])*0.587+(d[(y*sz+x+1)*4+2]-d[(y*sz+x-1)*4+2])*0.114;
    const dy2=(d[((y+1)*sz+x)*4]-d[((y-1)*sz+x)*4])*0.299+(d[((y+1)*sz+x)*4+1]-d[((y-1)*sz+x)*4+1])*0.587+(d[((y+1)*sz+x)*4+2]-d[((y-1)*sz+x)*4+2])*0.114;
    const mag=Math.sqrt(dx*dx+dy2*dy2);
    if(mag>10) aHist[Math.floor((Math.atan2(dy2,dx)+Math.PI)/Math.PI*9)%18]+=mag;
  }
  const totE=aHist.reduce((a,b)=>a+b,0)+1;
  let aEnt=0;
  for (let i=0;i<18;i++){const p=aHist[i]/totE;if(p>0)aEnt-=p*Math.log2(p);}
  aEnt/=Math.log2(18);

  const bSz=Math.floor(sz/8);
  const bDesc=[];
  for (let by=0;by<8;by++) for (let bx=0;bx<8;bx++) {
    let m=0,cnt=0;
    for (let y=by*bSz;y<(by+1)*bSz&&y<sz;y++) for (let x=bx*bSz;x<(bx+1)*bSz&&x<sz;x++) {
      m+=d[(y*sz+x)*4]*0.299+d[(y*sz+x)*4+1]*0.587+d[(y*sz+x)*4+2]*0.114;cnt++;
    }
    bDesc.push(m/(cnt*255));
  }
  let smooth=0,sCnt=0;
  for (let by=0;by<8;by++) for (let bx=0;bx<8;bx++) {
    if(bx>0){smooth+=Math.abs(bDesc[by*8+bx]-bDesc[by*8+bx-1]);sCnt++;}
    if(by>0){smooth+=Math.abs(bDesc[by*8+bx]-bDesc[(by-1)*8+bx]);sCnt++;}
  }
  const blockSmooth=sCnt>0?1-smooth/sCnt:0;

  const geoScore=Math.max(0,Math.min(1,(1-aEnt)*0.30+blockSmooth*0.35+(1-lineCons)*0.35));
  return {geoScore,lineCons,angleEntropy:aEnt,blockSmooth};
}

/* ── 기존 기본 특징 추출 ────────────────────────────────── */
function extractBaseFeatures(d, sz, n) {
  let rS=0,gS=0,bS=0;
  for (let i=0;i<d.length;i+=4){rS+=d[i];gS+=d[i+1];bS+=d[i+2];}
  const rM=rS/n,gM=gS/n,bM=bS/n;
  let gmA=0,gqA=0,satS=0,rV=0,gV=0,bV=0,rg=0,rb=0,gb=0;
  for (let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    const gr=r*0.299+g*0.587+b*0.114;
    gmA+=gr;gqA+=gr*gr;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    satS+=mx===0?0:(mx-mn)/mx;
    const dr=r-rM,dg=g-gM,db=b-bM;
    rV+=dr*dr;gV+=dg*dg;bV+=db*db;rg+=dr*dg;rb+=dr*db;gb+=dg*db;
  }
  const gMn=gmA/n,gStd=Math.sqrt(Math.max(0,gqA/n-gMn*gMn))/255;
  const rStd=Math.sqrt(rV/n),gStd2=Math.sqrt(gV/n),bStd=Math.sqrt(bV/n);
  const cRG=rStd*gStd2>0?Math.abs((rg/n)/(rStd*gStd2)):0;
  const cRB=rStd*bStd>0?Math.abs((rb/n)/(rStd*bStd)):0;
  const cGB=gStd2*bStd>0?Math.abs((gb/n)/(gStd2*bStd)):0;
  const avgCorr=(cRG+cRB+cGB)/3;

  const edgeBins=new Float32Array(8);
  let eH=0,eV=0,eDiag=0;
  for (let y=1;y<sz-1;y++) for (let x=1;x<sz-1;x++) {
    const G=([[(y-1)*sz+(x-1)],[(y-1)*sz+x],[(y-1)*sz+(x+1)],[y*sz+(x-1)],[y*sz+(x+1)],[(y+1)*sz+(x-1)],[(y+1)*sz+x],[(y+1)*sz+(x+1)]]).map(([idx])=>d[idx*4]*0.299+d[idx*4+1]*0.587+d[idx*4+2]*0.114);
    const gx=-G[0]-2*G[3]-G[5]+G[2]+2*G[4]+G[7];
    const gy=-G[0]-2*G[1]-G[2]+G[5]+2*G[6]+G[7];
    const mag=Math.sqrt(gx*gx+gy*gy);
    eH+=Math.abs(gy);eV+=Math.abs(gx);eDiag+=mag;
    edgeBins[Math.min(7,Math.floor(mag/46))]++;
  }
  const iN=(sz-2)*(sz-2),edgeMag=eDiag/(iN*362);
  let edgeEnt=0;
  for (let b=0;b<8;b++){const p=edgeBins[b]/iN;if(p>0)edgeEnt-=p*Math.log2(p);}
  edgeEnt/=3;

  let lbpV=0,lbpC=0;
  for (let y=4;y<sz-4;y+=4) for (let x=4;x<sz-4;x+=4) {
    const ci=(y*sz+x)*4,ctr=d[ci]*0.299+d[ci+1]*0.587+d[ci+2]*0.114;
    let code=0;
    [[-4,-4],[-4,0],[-4,4],[0,4],[4,4],[4,0],[4,-4],[0,-4]].forEach(([dy,dx],b)=>{
      const ni=((y+dy)*sz+(x+dx))*4;
      if(d[ni]*0.299+d[ni+1]*0.587+d[ni+2]*0.114>=ctr)code|=(1<<b);
    });
    lbpV+=code;lbpC++;
  }
  const lbpU=1-Math.abs(lbpV/lbpC/255-0.5)*2;

  let skinC=0,oSatC=0;
  for (let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    if(r>150&&g>90&&b>60&&r>g&&g>b&&(r-b)>30)skinC++;
    const mx=Math.max(r,g,b);
    if(mx>0&&(mx-Math.min(r,g,b))/mx>0.7)oSatC++;
  }

  const hSz=Math.floor(sz/2);let nS=0;
  for (let y=0;y<hSz;y++) for (let x=0;x<hSz;x++) {
    const [i00,i01,i10,i11]=[(y*2*sz+x*2),(y*2*sz+x*2+1),((y*2+1)*sz+x*2),((y*2+1)*sz+x*2+1)].map(i=>i*4);
    const [g00,g01,g10,g11]=[i00,i01,i10,i11].map(i=>d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);
    const bm=(g00+g01+g10+g11)/4;
    nS+=Math.abs(g00-bm)+Math.abs(g01-bm)+Math.abs(g10-bm)+Math.abs(g11-bm);
  }
  const noiseLevel=nS/(hSz*hSz*4*255);

  let symS=0;
  for (let y=0;y<sz;y++) for (let x=0;x<Math.floor(sz/2);x++){
    const li=(y*sz+x)*4,ri=(y*sz+(sz-1-x))*4;
    symS+=Math.abs((d[li]*0.299+d[li+1]*0.587+d[li+2]*0.114)-(d[ri]*0.299+d[ri+1]*0.587+d[ri+2]*0.114));
  }
  const asymmetry=symS/(sz*Math.floor(sz/2)*255);

  return {avgCorr,noiseLevel,asymmetry,lbpUniformity:lbpU,edgeEntropy:edgeEnt,
          overSatRatio:oSatC/n,grayStd:gStd,edgeMag,skinRatio:skinC/n};
}

/* ── 통합 특징 추출 ─────────────────────────────────────── */
/**
 * 원본 이미지 해상도를 기반으로 로컬 포렌식 vs Gemini 가중치를 동적으로 계산.
 * - 저해상도(≤256px): 로컬 포렌식 신뢰도 낮음 → Gemini 비중 ↑
 * - 고해상도(≥1024px): 로컬 포렌식이 신뢰 가능 → 균형 유지
 * Returns {localW, geminiW} (합산 = 1.0)
 */
function computeAdaptiveWeights(origWidth, origHeight) {
  const shortSide = Math.min(origWidth || 192, origHeight || 192);
  // 256px 이하: gemini=0.96, local=0.04
  // 1024px 이상: gemini=0.88, local=0.12
  // 그 사이: 선형 보간
  // 256px 이하: gemini=0.75, local=0.25
  // 1024px 이상: gemini=0.55, local=0.45
  // 그 사이: 선형 보간
  const lo = 256, hi = 1024;
  const t = Math.max(0, Math.min(1, (shortSide - lo) / (hi - lo)));
  const geminiW = 0.75 - t * 0.20; // 0.75 → 0.55
  return { localW: 1 - geminiW, geminiW };
}

function extractFeatures(bitmap) {
  const sz=192;
  const origW = bitmap.width  || sz;
  const origH = bitmap.height || sz;
  const canvas=new OffscreenCanvas(sz,sz);
  const ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,0,0,sz,sz);
  const d=ctx.getImageData(0,0,sz,sz).data;
  const n=sz*sz;

  const base=extractBaseFeatures(d,sz,n);
  const cfa=analyzeCFANoise(d,sz);
  const light=analyzeLighting(d,sz);
  const gan=analyzeGANPixels(d,sz);
  const file=analyzeFileDataProxy(d,sz);
  const geo=analyzeGeometricNoise(d,sz);

  // ── CFA 신뢰도 보정: 저해상도에서는 리사이즈/JPEG 압축으로 카메라
  //    노이즈 패턴이 왜곡되므로 cfaScore 기여를 선형적으로 감쇄시킴.
  //    원본 단변(shortSide) 기준: ≤192px → 0% 기여, ≥768px → 100% 기여
  // cfaTrust: 기준 완화 (192→128px, 768→512px) — 일반 SNS 이미지(400~600px)에서도 충분히 반영
  const cfaTrust = Math.max(0, Math.min(1, (Math.min(origW, origH) - 128) / (512 - 128)));
  const cfaAI  = cfa.cfaScore * cfaTrust;
  const cfaDf  = cfa.cfaScore * cfaTrust;

  // AI 점수: 기존(40%) + 신규 모듈(60%)
  // baseAI bias -0.14 → -0.05 (과도한 하향 억제 완화)
  const baseAI=base.avgCorr*0.08+(1-base.noiseLevel)*0.07+(1-Math.min(1,base.asymmetry*6))*0.04+
               base.lbpUniformity*0.05+(1-base.edgeEntropy)*0.04+base.overSatRatio*0.03+
               (1-Math.min(1,base.grayStd*4))*0.03-0.05;
  // 포렌식 모듈 가중치 상향: CFA/GAN 핵심 지표 비중 강화
  const newAI=cfaAI*CONFIG.cfa+light.lightingScore*CONFIG.lighting+gan.ganScore*CONFIG.gan+file.fileScore*CONFIG.file+geo.geoScore*CONFIG.geo;
  const aiRaw=baseAI+newAI;

  // DF 점수
  // baseDf bias -0.14 → -0.05 (과도한 하향 억제 완화)
  const baseDf=base.avgCorr*0.06+(1-base.noiseLevel)*0.06+base.lbpUniformity*0.07+
               (base.edgeMag>0.05&&base.edgeMag<0.25?0.06:0.01)+(1-base.edgeEntropy)*0.05+base.skinRatio*0.05-0.05;
  // 포렌식 모듈 가중치 상향
  const newDf=cfaDf*CONFIG.cfaDf+light.lightingScore*CONFIG.lightingDf+gan.ganScore*CONFIG.ganDf+file.fileScore*CONFIG.fileDf+geo.geoScore*CONFIG.geoDf;
  const dfRaw=baseDf+newDf;

  // ── 랜덤 노이즈 제거: 동일 이미지 반복 분석 시 재현성 보장
  const { localW, geminiW } = computeAdaptiveWeights(origW, origH);
  return {
    ai:Math.min(0.88,Math.max(0.02,aiRaw)),
    df:Math.min(0.88,Math.max(0.02,dfRaw)),
    _localW: localW,
    _geminiW: geminiW,
    _signals:{...base,
      cfaScore:cfa.cfaScore,cfaScoreEffective:cfaAI,cfaTrust,cfaRatio:cfa.cfaRatio,
      lightingScore:light.lightingScore,lightInconsistency:light.lightInconsistency,
      ganScore:gan.ganScore,checkerArtifact:gan.checkerArtifact,blockBoundary:gan.blockBoundary,
      fileScore:file.fileScore,poissonScore:file.poissonScore,vignetteRatio:file.vignetteRatio,
      geoScore:geo.geoScore,blockSmoothness:geo.blockSmooth,angleEntropy:geo.angleEntropy,
      origWidth:origW,origHeight:origH,localWeight:localW,geminiWeight:geminiW},
  };
}

/* ── 비트맵 → base64 ────────────────────────────────────── */
async function bitmapToBase64(bitmap) {
  try {
    const maxSz=512,scale=Math.min(1,maxSz/Math.max(bitmap.width||maxSz,bitmap.height||maxSz));
    const w=Math.max(1,Math.round((bitmap.width||maxSz)*scale)),h=Math.max(1,Math.round((bitmap.height||maxSz)*scale));
    const canvas=new OffscreenCanvas(w,h);canvas.getContext('2d').drawImage(bitmap,0,0,w,h);
    const blob=await canvas.convertToBlob({type:'image/jpeg',quality:0.75});
    const buf=await blob.arrayBuffer(),bytes=new Uint8Array(buf);
    let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(bin);
  } catch{return null;}
}

/* ── Gemini 호출 ────────────────────────────────────────── */
async function callServerAI(base64,isFrame) {
  if(!base64)return null;
  try {
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
    const res=await fetch('/api/ai-detect/image',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({imageBase64:base64,mimeType:'image/jpeg',isFrame}),signal:ctrl.signal});
    clearTimeout(timer);
    if(!res.ok){
      const err=await res.json().catch(()=>({error:`API 오류 (${res.status})`}));
      throw new Error(err.error||'서버 응답 오류');
    }
    const json=await res.json();
    return typeof json.aiConfidence==='number'?json:null;
  }catch(e){console.warn('[DG] callServerAI:',e.message);throw e;}
}

function blend(h,g) {
  if(!g)return h;
  // Gemini가 "실제 콘텐츠"라고 판정하면 신뢰도를 낮은 값으로 반전
  // aiVerdict/deepfakeVerdict가 AUTHENTIC/LIKELY_REAL이면 해당 점수를 낮게 처리
  const aiReal   = g.aiVerdict==='AUTHENTIC'||g.aiVerdict==='LIKELY_REAL';
  const dfReal   = g.deepfakeVerdict==='AUTHENTIC'||g.deepfakeVerdict==='LIKELY_REAL';
  const aiAI     = g.aiVerdict==='AI_GENERATED'||g.aiVerdict==='LIKELY_AI';
  const dfFake   = g.deepfakeVerdict==='DEEPFAKE'||g.deepfakeVerdict==='LIKELY_DEEPFAKE';

  // 실제 판별 신뢰도: verdict가 real이면 점수 = (100 - confidence)/100 * 0.15 (매우 낮게)
  const gDf = dfFake  ? Math.min(0.97, g.deepfakeConfidence/100)
            : dfReal  ? Math.max(0, (100 - g.deepfakeConfidence)/100 * 0.15)
            : g.deepfakeConfidence/200; // UNCERTAIN → 절반만 반영
  const gAi = aiAI    ? Math.min(0.97, g.aiConfidence/100)
            : aiReal  ? Math.max(0, (100 - g.aiConfidence)/100 * 0.15)
            : g.aiConfidence/200; // UNCERTAIN → 절반만 반영

  // 해상도 기반 동적 가중치 적용 (하드코딩된 0.92/0.08 대체)
  let gW = h._geminiW !== undefined ? h._geminiW : 0.92;
  let lW = h._localW  !== undefined ? h._localW  : 0.08;

  // 포렌식 강신호 오버라이드: CFA(신뢰도 보정 후) 또는 조명 점수가 0.8 이상이면
  // Gemini가 "실제"라고 해도 로컬 결과를 최소 25% 반영하여 과도한 억제 방지
  const sig = h._signals || {};
  const cfaEffective = sig.cfaScoreEffective !== undefined ? sig.cfaScoreEffective : (sig.cfaScore || 0);
  const highForensic = cfaEffective > 0.8 || (sig.lightingScore || 0) > 0.8;
  if (highForensic && (aiReal || dfReal)) {
    lW = Math.max(lW, 0.25);
    gW = 1 - lW;
  }

  return {df: gDf*gW + h.df*lW,
          ai: gAi*gW + h.ai*lW,
          _signals:h._signals};
}
function smooth(arr,size){const s=Math.max(0,arr.length-size);const w=arr.slice(s);return w.reduce((a,b)=>a+b,0)/w.length;}
function findSegments(scores,frames,threshold=0.55,minLen=2){
  const segs=[];let start=-1;
  for(let i=0;i<=scores.length;i++){
    const over=i<scores.length&&scores[i]>=threshold;
    if(over&&start===-1)start=i;
    if(!over&&start!==-1){
      if(i-start>=minLen){const sub=scores.slice(start,i);segs.push({startFrame:frames[start].frameIndex,endFrame:frames[i-1].frameIndex,startTime:frames[start].timestamp,endTime:frames[i-1].timestamp,avgConfidence:sub.reduce((a,b)=>a+b,0)/sub.length});}
      start=-1;
    }
  }
  return segs;
}

/* ── 메인 분석 ──────────────────────────────────────────── */
async function analyzeSegment({frames}) {
  const dfScores=[],aiScores=[],combined=[];
  let geminiResult=null;
  const isImage=frames.length===1;
  const allSignals=[];

  const gPs=[];
  for(let i=0;i<Math.min(2,frames.length);i++){
    const p=bitmapToBase64(frames[i].imageBitmap);
    // Gemini 실패(타임아웃 포함) 시 null로 resolve — 로컬 결과로 계속 진행
    gPs.push(p.then(b64=>callServerAI(b64,!isImage)).catch(e=>{
      console.warn('[DG] Gemini 호출 실패, 로컬 결과로 대체:', e.message);
      return null;
    }));
  }

  for(let i=0;i<frames.length;i++){
    const {imageBitmap,frameIndex,timestamp}=frames[i];
    const hS=extractFeatures(imageBitmap);
    allSignals.push(hS._signals);
    let serverAI=null;
    if(i<gPs.length){
      serverAI=await gPs[i]; // 이미 catch됐으므로 항상 resolve
      if(i===0)geminiResult=serverAI;
    }
    const scores=blend(hS,serverAI);
    const cS=Math.max(scores.df,scores.ai); // Gemini 유무 관계없이 최대값 사용
    dfScores.push(scores.df);aiScores.push(scores.ai);combined.push(cS);
    imageBitmap.close();
    postMessage({type:'FRAME_RESULT',payload:{
      confidence:cS,dfConfidence:scores.df,aiConfidence:scores.ai,
      smoothedConfidence:smooth(combined,WINDOW_SIZE),
      frameIndex,timestamp,progress:(i+1)/frames.length,memBytes:0,geminiActive:!!serverAI,
      forensicSignals:hS._signals,
    }});
    if(i%8===0)await new Promise(r=>setTimeout(r,0));
  }

  const dfAvg=dfScores.reduce((a,b)=>a+b,0)/dfScores.length;
  const aiAvg=aiScores.reduce((a,b)=>a+b,0)/aiScores.length;
  const cAvg=combined.reduce((a,b)=>a+b,0)/combined.length;
  const cMax=Math.max(...combined);

  const avgForensic=allSignals.length>0?{
    cfaScore:    allSignals.reduce((a,s)=>a+(s.cfaScore||0),0)/allSignals.length,
    lightingScore:allSignals.reduce((a,s)=>a+(s.lightingScore||0),0)/allSignals.length,
    ganScore:    allSignals.reduce((a,s)=>a+(s.ganScore||0),0)/allSignals.length,
    fileScore:   allSignals.reduce((a,s)=>a+(s.fileScore||0),0)/allSignals.length,
    geoScore:    allSignals.reduce((a,s)=>a+(s.geoScore||0),0)/allSignals.length,
  }:null;

  // ── 포렌식 공통 지표 계산 (Gemini 유무 무관하게 항상 사용) ──────────────
  const _cfaEff = allSignals.length > 0
    ? allSignals.reduce((a,s)=>a+(s.cfaScoreEffective??s.cfaScore??0),0)/allSignals.length
    : 0;
  const _lightEff = avgForensic ? (avgForensic.lightingScore || 0) : 0;
  const _ganEff   = avgForensic ? (avgForensic.ganScore      || 0) : 0;
  const _geoEff   = avgForensic ? (avgForensic.geoScore      || 0) : 0;
  const _fileEff  = avgForensic ? (avgForensic.fileScore     || 0) : 0;
  const sumWeights = (CONFIG.cfa + CONFIG.lighting + CONFIG.gan + CONFIG.geo + CONFIG.file) || 1;
  const cfaWNorm = CONFIG.cfa / sumWeights;
  const lightWNorm = CONFIG.lighting / sumWeights;
  const ganWNorm = CONFIG.gan / sumWeights;
  const geoWNorm = CONFIG.geo / sumWeights;
  const fileWNorm = CONFIG.file / sumWeights;
  const _forensicAll = _cfaEff*cfaWNorm + _lightEff*lightWNorm + _ganEff*ganWNorm + _geoEff*geoWNorm + _fileEff*fileWNorm;
  // 원본 cfaScore (cfaTrust 보정 전) — 저해상도 이미지에서도 강신호 포착용
  const _cfaRaw = allSignals.length > 0
    ? allSignals.reduce((a,s)=>a+(s.cfaScore||0),0)/allSignals.length
    : 0;
  // ── 강신호 조건 (다중 모듈 교차 검증 필수 — CFA 단독 오탐 방지)
  // CFA만 높고 나머지가 낮을 때(JPEG 압축 아티팩트, 리사이즈 왜곡 등)는 강신호로 처리하지 않음.
  // 활성화 조건: 반드시 2개 이상의 독립 모듈이 동시에 이상 신호를 보여야 함.
  const _highModuleCount = [
    _cfaEff   > 0.55,
    _lightEff > 0.45,
    _ganEff   > 0.45,
    _fileEff  > 0.45,
    _geoEff   > 0.45,
  ].filter(Boolean).length;
  // 조건 A: 포렌식 종합 0.45 이상 AND 2개 이상 모듈 강신호
  // 조건 B: CFA+조명 동시 0.60 이상 (얼굴 딥페이크의 핵심 이중 신호)
  // 조건 C: 4개 이상 모듈이 동시에 0.45 이상 (전방위 오탐 가능성 낮음)
  const _strongForensic = (_forensicAll > 0.45 && _highModuleCount >= 2)
    || (_cfaEff > 0.60 && _lightEff > 0.60)
    || _highModuleCount >= 4;

  // effectiveAvg: 포렌식 신호를 항상 반영
  let effectiveAvg;
  if(geminiResult){
    const gAiR = geminiResult.aiVerdict==='AUTHENTIC'||geminiResult.aiVerdict==='LIKELY_REAL';
    const gDfR = geminiResult.deepfakeVerdict==='AUTHENTIC'||geminiResult.deepfakeVerdict==='LIKELY_REAL';
    if(_strongForensic){
      // 강한 포렌식 신호 → 포렌식 직결 (단, 모듈 분산도 반영)
      // 모듈 불균형 패널티: 유효 모듈 수가 적을수록 최종 신뢰도 감쇄
      const _diversityFactor = Math.min(1.0, _highModuleCount / 3.0); // 3개 이상이어야 100%
      effectiveAvg = Math.min(0.97, (_forensicAll * 0.85 + 0.10) * _diversityFactor + _forensicAll * (1 - _diversityFactor) * 0.5);
    } else if(gAiR && gDfR){
      // 양쪽 다 실제 + 포렌식 중간 신호 → boost 임계값 낮춰서 저해상도도 반영
      const forensicBoost = _forensicAll > 0.25 ? _forensicAll * 0.40 : (_forensicAll > 0.15 ? _forensicAll * 0.20 : 0);
      effectiveAvg = Math.min(0.50, Math.max(cAvg, forensicBoost));
    } else {
      // 조작 신호 있을 때: blend된 점수 + 포렌식 boost 함께 반영
      const forensicBoost = _forensicAll > 0.40 ? _forensicAll * 0.20 : 0;
      effectiveAvg = Math.min(0.97, Math.max(dfAvg, aiAvg) + forensicBoost);
    }
  } else {
    // Gemini 없을 때: 포렌식 신호 직접 반영 (모듈 다양성 체크 포함)
    const localBase = isImage ? Math.max(cAvg, aiAvg*0.95, dfAvg*0.9) : cAvg;
    // CFA 단독 고점 패널티: 나머지 4개 평균이 낮으면 CFA 기여 감쇄
    const _otherAvg = (_lightEff + _ganEff + _geoEff + _fileEff) / 4;
    const _cfaDominance = _cfaEff > 0 ? Math.max(0, _cfaEff - _otherAvg * 2) : 0;
    // cfaDominance가 클수록(CFA만 혼자 높을수록) forensicAll을 아래로 당김
    const _adjustedForensicAll = Math.max(0, _forensicAll - _cfaDominance * 0.5);
    const forensicBoost = _adjustedForensicAll > 0.40
      ? _adjustedForensicAll * 0.35
      : _adjustedForensicAll > 0.25
        ? _adjustedForensicAll * 0.18
        : 0;
    effectiveAvg = Math.min(0.97, localBase + forensicBoost);
  }

  let detectionType='DEEPFAKE_MANIPULATED';
  if(aiAvg>dfAvg*1.1)detectionType='AI_GENERATED';
  else if(cAvg>0.4)detectionType='AI_MANIPULATED';

  let verdict;
  if(geminiResult && !_strongForensic){
    // Gemini 판정 사용 (강신호 아닐 때만)
    const gv=geminiResult.aiVerdict,gc=geminiResult.aiConfidence;
    if(gv==='AI_GENERATED')verdict='FAKE';
    else if(gv==='LIKELY_AI')verdict=gc>=70?'FAKE':'SUSPICIOUS';
    else if(gv==='AUTHENTIC'||gv==='LIKELY_REAL'){
      // AUTHENTIC여도 effectiveAvg 기반으로 재검토
      verdict = effectiveAvg > 0.35 ? 'SUSPICIOUS' : 'AUTHENTIC';
    }
    else verdict=gc>=60?'SUSPICIOUS':'AUTHENTIC';
  } else {
    // Gemini 없거나 강신호 오버라이드: effectiveAvg 임계값 기반
    const ft=isImage?CONFIG.imageFakeThreshold:CONFIG.videoFakeThreshold, st=isImage?CONFIG.imageSuspiciousThreshold:CONFIG.videoSuspiciousThreshold;
    verdict=effectiveAvg>ft?'FAKE':effectiveAvg>st?'SUSPICIOUS':'AUTHENTIC';
  }

  postMessage({type:'ANALYSIS_COMPLETE',payload:{
    verdict,detectionType,maxConfidence:cMax,avgConfidence:effectiveAvg,
    dfAvgConfidence:dfAvg,dfMaxConfidence:Math.max(...dfScores),
    aiAvgConfidence:aiAvg,aiMaxConfidence:Math.max(...aiScores),
    totalFrames:frames.length,suspiciousSegments:findSegments(combined,frames),
    scores:combined,dfScores,aiScores,geminiResult,forensicReport:avgForensic,
  }});
}

self.onmessage=async({data:{type,payload}})=>{
  switch(type){
    case 'INIT':
      try {
        const res = await fetch('/api/forensics/weights');
        if (res.ok) {
          const loadedConfig = await res.json();
          CONFIG = { ...CONFIG, ...loadedConfig };
        }
      } catch (e) {
        console.warn('[DG Worker] Failed to load forensics weights, using defaults:', e);
      }
      postMessage({type:'MODEL_READY'});
      break;
    case 'ANALYZE':await analyzeSegment(payload);break;
    case 'MEM':postMessage({type:'MEM',payload:{numBytes:0}});break;
  }
};
