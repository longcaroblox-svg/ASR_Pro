var xr=Object.defineProperty;var c=(e,t)=>xr(e,"name",{value:t,configurable:!0});import{spawn as me}from"node:child_process";import Z from"node:fs";import Po from"node:http";import We from"node:os";import q from"node:path";import{pathToFileURL as Oo}from"node:url";import Kt from"node:fs";function vr(e){if(typeof e=="string")return e;try{return JSON.stringify(e)}catch{return String(e)}}c(vr,"stringifyDetail");var f=class extends Error{static{c(this,"ASRError")}constructor(t="",{detail:n,cause:r}={}){super(t,r!==void 0?{cause:r}:void 0),this.name=new.target.name,this.message=t,this.detail=n,r!==void 0&&(this.cause=r)}describe(){return this.message&&this.detail!==void 0&&this.detail!==null?`${this.message} (${vr(this.detail)})`:this.message||this.name}toString(){return this.describe()}},at=class extends f{static{c(this,"AppError")}},et=class extends f{static{c(this,"CancelledError")}},X=class extends f{static{c(this,"ProviderError")}constructor(t="",{provider:n,phase:r,detail:o,retryable:s=!1,cause:i}={}){super(t,{detail:o,...i!==void 0?{cause:i}:{}}),this.provider=n,this.phase=r,this.retryable=!!s,i!==void 0&&(this.cause=i)}describe(){let t=super.describe(),n=`[${this.provider}/${this.phase}]`;return t&&t!==this.name?`${n} ${t}`:n}},Wt=class extends f{static{c(this,"ExportError")}},yt=class extends f{static{c(this,"CircuitOpenError")}},tt=class extends f{static{c(this,"NetworkError")}constructor(t,{detail:n=null,connectPhase:r=!1,cause:o}={}){super(t,{detail:n,...o!==void 0?{cause:o}:{}}),this.transient=!0,this.connectPhase=r,o!==void 0&&(this.cause=o)}},Pt=class extends tt{static{c(this,"ConnectTimeoutError")}constructor(t,n={}){super(t,{...n,connectPhase:!0})}},Ot=class extends tt{static{c(this,"ReadTimeoutError")}constructor(t,n={}){super(t,n)}};function Yt(e){return e instanceof et||e?.name==="CancelledError"}c(Yt,"isCancelled");import Gt from"node:fs";var be=Object.freeze([96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350]),Se=class{static{c(this,"BitReader")}#t;#e=0;constructor(t){this.#t=t}take(t){let n=0;for(let r=0;r<t;r++){let o=this.#t[this.#e>>3];if(o===void 0)throw new f("ASC kết thúc sớm — DecoderSpecificInfo hỏng");n=n<<1|o>>7-(this.#e&7)&1,this.#e+=1}return n}},xe=class{static{c(this,"MetaReader")}#t;constructor(t){this.#t=t}read(t,n){let r=Buffer.allocUnsafe(n),o=0;for(;o<n;){let s=Gt.readSync(this.#t,r,o,n-o,Number(t)+o);if(s<=0)throw new f(`MP4 đọc hụt ${n-o}B tại offset ${Number(t)+o}`);o+=s}return r}u32(t){return this.read(t,4).readUInt32BE(0)}u64(t){return this.read(t,8).readBigUInt64BE(0)}type(t){return this.read(t,4).toString("latin1")}};function*qt(e,t,n,r){let o=BigInt(t),s=BigInt(n);for(;o<s;){if(o+8n>s)throw new f(`${r}: box header vượt ranh giới`);let i=e.u32(Number(o)),a=8;if(i===1){let u=e.u64(Number(o)+8);if(u<16n)throw new f(`${r}: box largesize ${u} < header`);if(i=Number(u),!Number.isSafeInteger(i))throw new f(`${r}: box quá lớn vượt giới hạn JS`);a=16}else i===0&&(i=Number(s-o));if(i<a)throw new f(`${r}: box size ${i} < header`);if(o+BigInt(i)>s)throw new f(`${r}: box vượt EOF`);yield{type:e.type(Number(o)+4),start:o,dataStart:o+BigInt(a),size:i},o+=BigInt(i)}}c(qt,"iterBoxes");var ht=c(e=>Number(e.start+BigInt(e.size)),"endOf");function dt(e,t,n,r){if(!Number.isInteger(t)||!Number.isInteger(n)||t<0||n<0||t+n>e.length)throw new f(`${r}: box cụt (cần [${t},${t+n}) trong ${e.length}B)`)}c(dt,"need");function lt(e,t,n){return dt(e,t,4,n),e.readUInt32BE(t)}c(lt,"u32b");function Er(e,t,n){return dt(e,t,8,n),e.readBigUInt64BE(t)}c(Er,"u64b");function Lt(e,t,n,r,o){for(let s of qt(e,t,n,o))if(s.type===r)return s;return null}c(Lt,"findBox");function ye(e,t){if(t>=e.length)throw new f("esds: descriptor thiếu tag");let n=e[t++],r=0;for(let o=0;o<4;o++){if(t>=e.length)throw new f("esds: descriptor thiếu length");let s=e[t++];if(r=r<<7|s&127,!(s&128))break}if(t+r>e.length)throw new f("esds: descriptor vượt payload");return{tag:n,start:t,len:r}}c(ye,"readDescriptor");function Ar(e){if(!e||e.length<2)throw new f("ASC rỗng/hỏng");let t=new Se(e),n=t.take(5);n===31&&(n=32+t.take(6));let r=t.take(4),o=t.take(4);if(r===15){let i=t.take(24),a=be.indexOf(i);if(a<0)throw new f(`AAC sample rate ${i}Hz không biểu diễn được trong ADTS`);return s(n,a,i,o)}if(r>=be.length)throw new f(`ASC freq index ${r} không hợp lệ`);return s(n,r,be[r],o);function s(i,a,l,u){if(u===0||u>7)throw new f(`ASC channel config ${u} không hỗ trợ (cần 1–7)`);return{audioObjectType:i,freqIdx:a,sampleRate:l,chanCfg:u}}}c(Ar,"parseAsc");function Mr(e,t){let n=ye(e,0);if(n.tag!==3)throw new f(`${t}: esds thiếu ES_Descriptor (tag ${n.tag})`);let r=n.start;if(r+=2,r>=e.length)throw new f(`${t}: esds ES_Descriptor cụt`);let o=e[r++];if(o&128&&(r+=2),o&64){if(r>=e.length)throw new f(`${t}: esds URL_Flag cụt`);r+=1+e[r]}o&32&&(r+=2);let s=ye(e,r);if(s.tag!==4)throw new f(`${t}: esds thiếu DecoderConfigDescriptor (tag ${s.tag})`);if(s.start>=e.length)throw new f(`${t}: DecoderConfigDescriptor cụt`);let i=e[s.start];if(i!==64&&!(i>=102&&i<=104))throw new f(`${t}: audio object type 0x${i.toString(16)} không phải AAC — NO-FALLBACK`);let a=s.start+13;if(a>=e.length)throw new f(`${t}: mp4a thiếu DecoderSpecificInfo (ASC)`);let l=ye(e,a);if(l.tag!==5)throw new f(`${t}: esds thiếu DecoderSpecificInfo (tag ${l.tag})`);return e.subarray(l.start,l.start+l.len)}c(Mr,"parseEsdsPayload");function qe(e,t,n,r){for(let o of qt(e,t,n,r)){if(o.type==="esds"){let s=e.read(Number(o.dataStart)+4,ht(o)-(Number(o.dataStart)+4));return Mr(s,r)}if(o.type==="wave"){let s=qe(e,Number(o.dataStart),ht(o),`${r}/wave`);if(s)return s}}return null}c(qe,"findAscInEntry");function vt(e,t,n,r){let o=Lt(e,Number(t.dataStart),ht(t),n,r);if(!o)throw new f(`${r}: thiếu ${n}`);return o}c(vt,"requireChild");function _r(e,t,n){let r=Lt(e,Number(t.dataStart),ht(t),"mdia",n);if(!r)return null;let o=Lt(e,Number(r.dataStart),ht(r),"hdlr",n);if(!o||e.type(Number(o.dataStart)+8)!=="soun")return null;let i=vt(e,r,"mdhd",n),a=e.read(Number(i.dataStart),1)[0],l,u;if(a===1)l=e.u32(Number(i.dataStart)+20),u=e.u64(Number(i.dataStart)+24);else if(a===0)l=e.u32(Number(i.dataStart)+12),u=e.u32(Number(i.dataStart)+16);else throw new f(`${n}: mdhd version ${a} không hỗ trợ (cần 0/1)`);if(!l)throw new f(`${n}: timescale 0 — timeline hỏng`);let d=`${n}/stbl`,g=vt(e,r,"minf",n),w=vt(e,g,"stbl",d),h=vt(e,w,"stsd",d);if(e.u32(Number(h.dataStart)+4)<1)throw new f(`${d}: stsd rỗng`);let S=Number(h.dataStart)+8,N=ht(h);if(S+8>N)throw new f(`${d}: stsd cụt trước sample entry`);let k=e.u32(S);if(!Number.isSafeInteger(k)||k<8)throw new f(`${d}: sample entry size ${k} vô lý`);let x=Math.min(S+k,N),E=e.type(S+4),m,y=null;if(E==="enca")throw new f(`${d}: audio track bị mã hóa DRM — không xử lý được`);if(E==="mp4a"){let M=S+8,b=e.read(M+8,2).readUInt16BE(0);if(b!==0&&b!==1&&b!==2)throw new f(`${d}: mp4a version ${b} không hỗ trợ (cần 0/1/2)`);let _=b===2?36:b===1?16:0,B=M+28+_;if(B>x)throw new f(`${d}: mp4a entry size ${k} quá nhỏ cho version ${b}`);if(y=qe(e,B,x,d),!y||y.length===0)throw new f(`${d}: mp4a thiếu DecoderSpecificInfo`);m="aac"}else if(E===".mp3"||E==="mp3 ")m="mp3";else throw new f(`${d}: codec audio '${E}' không hỗ trợ passthrough (hỗ trợ: mp4a/AAC, .mp3) — NO-FALLBACK`);let O=vt(e,w,"stts",d),C=vt(e,w,"stsc",d),I=vt(e,w,"stsz",d),$=Lt(e,Number(w.dataStart),ht(w),"stco",d)??Lt(e,Number(w.dataStart),ht(w),"co64",d);if(!$)throw new f(`${d}: thiếu stco/co64`);let T=c(M=>e.read(Number(M.dataStart)+4,ht(M)-(Number(M.dataStart)+4)),"body"),A={codec:m,...m==="aac"?{...Ar(y),ascBytes:Buffer.from(y)}:{},timescale:l,mediaDurationRaw:u};return kr(A,{sttsBody:T(O),stscBody:T(C),stszBody:T(I),stcoKind:$.type,stcoBody:T($)}),A}c(_r,"parseAudioTrak");function kr(e,t){let n=t.sttsBody;dt(n,0,4,"stts");let r=lt(n,0,"stts");if(r===0)throw new f("stts rỗng — timeline rỗng");dt(n,0,4+r*8,"stts");let o=[];for(let P=0,v=4;P<r;P++,v+=8){let R=lt(n,v,"stts"),D=lt(n,v+4,"stts");if(!(R>=1))throw new f(`stts hàng ${P} count ${R} vô lý (cần ≥1)`);if(!(D>=1))throw new f(`stts hàng ${P} delta ${D} vô lý (cần ≥1)`);o.push([R,D])}let s=new Float64Array(r),i=new Float64Array(r),a=0,l=0;for(let P=0;P<r;P++)a+=o[P][0],l+=o[P][0]*o[P][1],s[P]=a,i[P]=l;let u=a,d=e.timescale||1;e.auCount=u;let g=0;e.auDtsS=c(function(v){if(!Number.isInteger(v)||v<0||v>=u)throw new f(`AU index ${v} ngoài [0,${u})`);let R=g,D=R>0?s[R-1]:0;if(v<D||v>=s[R]){if(R+1<r&&v>=s[R]&&v<s[R+1])R+=1;else{let V=0,K=r-1;for(R=0;V<=K;){let ot=V+K>>1;v<s[ot]?(R=ot,K=ot-1):V=ot+1}}g=R}let L=R>0?s[R-1]:0;return((R>0?i[R-1]:0)+(v-L)*o[R][1])/d},"auDtsS");let w=r>0?i[r-1]:0,h=Number(e.mediaDurationRaw)/d;e.durationS=Math.max(w/d,h>0?h:0),e.auIndexAtS=c(function(v){if(!(v>0))return 0;let R=v*d,D=0,L=r-1,U=r-1;for(;D<=L;){let xt=D+L>>1;i[xt]>R?(U=xt,L=xt-1):D=xt+1}let V=U>0?s[U-1]:0,K=U>0?i[U-1]:0,ot=o[U][1];if(ot<=0)return Math.min(u-1,V);let nt=Math.floor((R-K)/ot);return Math.max(0,Math.min(u-1,V+nt))},"auIndexAtS");let p=t.stszBody;dt(p,0,8,"stsz");let S=lt(p,0,"stsz"),N=lt(p,4,"stsz");if(S!==0&&N!==u)throw new f(`stsz count ${N} ≠ stts count ${u}`);if(S===0){if(N!==u)throw new f(`stsz count ${N} ≠ stts count ${u}`);dt(p,0,8+N*4,"stsz")}else if(p.length<8)throw new f("stsz uniform header cụt");let k=t.stscBody;dt(k,0,4,"stsc");let x=lt(k,0,"stsc");if(x===0)throw new f("stsc rỗng — chunk map rỗng");dt(k,0,4+x*12,"stsc");let E=[];for(let P=0,v=4;P<x;P++,v+=12){let R=lt(k,v,"stsc"),D=lt(k,v+4,"stsc"),L=lt(k,v+8,"stsc");if(P===0&&R<1)throw new f(`stsc hàng 0 firstChunk ${R} vô lý (cần ≥1)`);if(P>0&&!(R>E[P-1][0]))throw new f(`stsc hàng ${P} firstChunk ${R} không tăng đơn điệu (trước ${E[P-1][0]})`);if(!(D>=1))throw new f(`stsc hàng ${P} samplesPerChunk ${D} vô lý (cần ≥1)`);if(!(L>=1))throw new f(`stsc hàng ${P} sampleDescIndex ${L} vô lý (cần ≥1)`);E.push([R,D])}let m=t.stcoBody;dt(m,0,4,"stco/co64");let y=lt(m,0,"stco/co64");if(y===0)throw new f("stco/co64 rỗng — không có chunk nào");let O=t.stcoKind==="co64";if(dt(m,0,4+y*(O?8:4),"stco/co64"),E[E.length-1][0]>y)throw new f(`stsc firstChunk ${E[E.length-1][0]} vượt chunkCount ${y}`);let C=c(P=>O?Number(Er(m,4+P*8,"co64")):lt(m,4+P*4,"stco"),"chunkOffset"),I=new Array(E.length);{let P=0;for(let v=0;v<E.length;v++){I[v]=P;let R=E[v][0]-1,L=(v+1<E.length?E[v+1][0]-1:y)-R;if(!(L>=0))throw new f(`stsc hàng ${v} phủ chunk âm`);P+=L*E[v][1]}}let $=c(P=>{let v=0,R=E.length-1,D=-1;for(;v<=R;){let L=v+R>>1;E[L][0]-1<=P?(D=L,v=L+1):R=L-1}if(D<0)throw new f(`stsc không phủ chunk ${P}`);return D},"rowIndexForChunk"),T=c(P=>{if(P<0||P>=y)throw new f(`chunk ${P} ngoài stsc`);let v=$(P);return I[v]+(P-(E[v][0]-1))*E[v][1]},"chunkFirstAu"),A=c(P=>{let v=0,R=I.length-1,D=0;for(;v<=R;){let L=v+R>>1;I[L]<=P?(D=L,v=L+1):R=L-1}return D},"rowIndexForAu"),M=c(P=>{let v=A(P);for(;v+1<E.length&&I[v+1]<=P;)v++;for(;v>0&&I[v]>P;)v--;let R=E[v][1];if(!(R>0))throw new f(`stsc hàng ${v} samplesPerChunk vô lý`);let D=E[v][0]-1+Math.floor((P-I[v])/R);for(;v+1<E.length&&D>=E[v+1][0]-1;){v++;let L=E[v][1];D=E[v][0]-1+Math.floor((P-I[v])/L)}return D<0&&(D=0),D>=y&&(D=y-1),D},"chunkForAu"),b=0,_=0,B=0,j=0,J=y>0?C(0):0,W=c(()=>{b=0,_=0,B=0,j=0,J=y>0?C(0):0,g=0},"resetCursor"),Y=c(P=>S!==0?S:p.readUInt32BE(8+P*4),"auSizeAt"),H=c(P=>{let v=M(P),R=$(v),D=I[R]+(v-(E[R][0]-1))*E[R][1],L=P-D,U=C(v),V;if(S!==0)V=U+L*S;else{V=U;for(let K=0;K<L;K++)V+=Y(D+K)}return b=R,_=v,B=D,j=P,J=V,{pos:V,size:Y(P)}},"auLocationDirect");e.auLocation=c(function(v){if(!Number.isInteger(v)||v<0||v>=u)throw new f(`AU index ${v} ngoài phạm vi`);if(v<j||v-j>64)return H(v);for(;j<v;){let R=E[b][1];if(j+1-B>=R){if(_+=1,_>=y)throw new f("stco hết chunk trước khi hết AU");B=j+1,b+1<E.length&&_>=E[b+1][0]-1&&(b+=1),J=C(_)}else J+=Y(j);j+=1}return{pos:J,size:Y(j)}},"auLocation"),e.iterateAus=c(function*(v=0,R=u){if(!Number.isInteger(v)||!Number.isInteger(R))throw new f(`MP4 iterateAus [${v},${R}) không phải số nguyên`);if(v<0||R>u||R<v)throw new f(`MP4 iterateAus [${v},${R}) ngoài [0,${u}]`);W();let D=-1;for(let L=v;L<R;L++){let U=e.auLocation(L);if(U.pos<D)throw new f(`MP4: AU ${L} nằm lùi vị trí file (${U.pos} < ${D}) — muxer bất thường, từ chối cắt`);D=U.pos,yield{index:L,pos:U.pos,size:U.size,dtsS:e.auDtsS(L)}}},"iterateAus")}c(kr,"attachSampleTable");function Ve(e){let t=Gt.openSync(e,"r");try{let n=new xe(t),r=Gt.fstatSync(t).size,o=[],s=[],i=!1;for(let l of qt(n,0,r,e))if(l.type==="moov"){i=!0;for(let u of qt(n,Number(l.dataStart),ht(l),`${e}/moov`))if(u.type==="trak")try{let d=_r(n,u,`${e}/trak#${o.length+s.length}`);d&&o.push(d)}catch(d){s.push(d?.message??String(d))}}if(!i)throw new f("MP4 không có moov — fragmented (moof) hoặc file hỏng");let a=o.find(l=>l.codec==="aac"||l.codec.startsWith("mp3"));if(!a){let l=s.length>0?` · lý do: ${s.join(" | ")}`:"";throw new f(`MP4 không có audio track hỗ trợ passthrough${l}`)}return{kind:a.codec==="aac"?"mp4-aac":"mp4-mp3",durationS:a.durationS,track:a,rejectedTracks:s}}finally{Gt.closeSync(t)}}c(Ve,"inspectMp4");function ve(e){if(e>=1&&e<=4)return e-1;if(e===5||e===29)return 1;throw new f(`AOT ${e} không đóng gói được vào ADTS (chỉ AOT 1–4, 5, 29)`)}c(ve,"adtsProfile");import Ft from"node:fs";var Ir=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],Ke=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],Nr=[0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],Tr=[0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],$r=[[44100,48e3,32e3],[22050,24e3,16e3],[11025,12e3,8e3]],Cr=Object.freeze({3:0,2:1,0:2}),Vt={versionBits:0,layer:0,bitrateKbps:0,sampleRate:0,samplesPerFrame:0,size:0},Rr={versionBits:0,layer:0,bitrateKbps:0,sampleRate:0,samplesPerFrame:0,size:0};function Xe(e,t){if(e[0]!==255||(e[1]&224)!==224)return!1;let n=e[1]>>3&3,r=e[1]>>1&3;if(n===1||r===0)return!1;let o=e[2]>>4&15,s=e[2]>>2&3;if(o===0||o===15||s===3)return!1;let i=e[2]>>1&1,a=4-r,l;a===3?l=(n===3?Ir:Ke)[o]:a===2?l=n===3?Tr[o]:Ke[o]:l=Nr[o];let u=Cr[n],d=u===void 0?0:$r[u][s];if(!d||!l)return!1;let g=a===1?384:a===2||n===3?1152:576,w=a===1?(Math.floor(12*l*1e3/d)+i)*4:Math.floor(g/8*l*1e3/d)+i;return w>=1?(t.versionBits=n,t.layer=a,t.bitrateKbps=l,t.sampleRate=d,t.samplesPerFrame=g,t.size=w,!0):!1}c(Xe,"parseFrameHeaderInto");function Qe(e){let t=Ft.openSync(e,"r");try{let n=Ft.fstatSync(t).size,r=0,o=Buffer.alloc(10);if(Ft.readSync(t,o,0,10,0)>=10&&o.toString("latin1",0,3)==="ID3"){for(let _=6;_<=9;_++)if(o[_]&128)throw new f("MP3: ID3 syncsafe size hỏng (bit cao đặt)");if(r=10+((o[6]&127)<<21|(o[7]&127)<<14|(o[8]&127)<<7|o[9]&127)+(o[5]&16?10:0),!(r>=10&&r<=n))throw new f(`MP3: ID3 tag vượt EOF (tag end ${r} > file ${n})`)}let i=[],a=1<<20,l=Buffer.allocUnsafe(a),u=-1,d=-1,g=c(b=>{let _=Math.max(0,Math.min(b,Math.max(0,n-1))),B=Math.min(n,_+a),j=0;for(;j<B-_;){let J=Ft.readSync(t,l,j,B-_-j,_+j);if(J<=0)break;j+=J}u=_,d=_+j},"loadWin"),w=c(b=>b<0||b+4>n||(b<u||b+4>d)&&(g(b),b<u||b+4>d)?null:l.subarray(b-u,b-u+4),"readAt"),h=0,p=r,S=0,N=!1,k=0,x=0,E=0,m=0,y=!1;for(;;){let b=w(r);if(b===null)break;if(!Xe(b,Vt)){if(m+=1,m>512)throw new f(`MP3: quá nhiều điểm sync hỏng (${m}) — file lỗi`);let W=r+1,Y=!1;for(;W<n-4&&W-r<4096;){let H=w(W);if(H!==null&&Xe(H,Rr)){Y=!0;break}W+=1}if(!Y)break;r=W,y=!0;continue}let B=Vt.size,j=Vt.samplesPerFrame,J=Vt.sampleRate;if(r+B>n)break;N&&!y&&k===B&&x===j&&E===J?h+=1:(N&&h>0&&i.push({start:S,frames:h-S,size:k,samplesPerFrame:x,sampleRate:E,startPos:p}),p=r,S=h,k=B,x=j,E=J,N=!0,h+=1,y=!1),r+=B}N&&h>0&&i.push({start:S,frames:h-S,size:k,samplesPerFrame:x,sampleRate:E,startPos:p});let O=0,C=0;for(let b of i)b.startAbs=O,b.startSec=C,O+=b.frames,C+=b.frames*b.samplesPerFrame/b.sampleRate;if(O===0)throw new f("MP3: không tìm thấy frame nào hợp lệ");let I=O,$=0,T=c(b=>{let _=i[$];if(_&&b>=_.startAbs&&b<_.startAbs+_.frames)return _;let B=i[$+1];if(B&&b>=B.startAbs&&b<B.startAbs+B.frames)return $+=1,B;let j=0,J=i.length-1;for(;j<=J;){let W=j+J>>1;b<i[W].startAbs?J=W-1:j=W+1}return $=J>=0?J:0,i[$]},"runFor"),M={codec:"mp3",sampleRate:i[0].sampleRate,auCount:I,durationS:C,auDtsS:c(b=>{if(!Number.isInteger(b)||b<0||b>=I)throw new f(`frame ${b} ngoài phạm vi`);let _=T(b);return _.startSec+(b-_.startAbs)*_.samplesPerFrame/_.sampleRate},"auDtsS"),auIndexAtS:c(b=>{if(!(b>0))return 0;let _=0,B=i.length-1,j=i.length-1;for(;_<=B;){let W=_+B>>1,Y=i[W],H=Y.frames*Y.samplesPerFrame/Y.sampleRate;b<Y.startSec+H?(j=W,B=W-1):_=W+1}let J=i[j];return Math.min(I-1,J.startAbs+Math.floor((b-J.startSec)*J.sampleRate/J.samplesPerFrame))},"auIndexAtS"),auLocation:c(b=>{if(!Number.isInteger(b)||b<0||b>=I)throw new f(`frame ${b} ngoài phạm vi`);let _=T(b);return{pos:_.startPos+(b-_.startAbs)*_.size,size:_.size}},"auLocation"),*iterateAus(b=0,_=I){if(!Number.isInteger(b)||!Number.isInteger(_))throw new f(`MP3 iterateAus [${b},${_}) không phải số nguyên`);if(b<0||_>I||_<b)throw new f(`MP3 iterateAus [${b},${_}) ngoài [0,${I}]`);for(let B=b;B<_;B++){let j=M.auLocation(B);yield{index:B,...j,dtsS:M.auDtsS(B)}}}};return{kind:"mp3",durationS:M.durationS,track:M,resyncs:m}}finally{Ft.closeSync(t)}}c(Qe,"inspectMp3");import It from"node:fs";function Ze(e,t,n,r){if(!Number.isSafeInteger(e)||e<0)throw new f("WAV header: dataBytes không hợp lệ");if(!Number.isInteger(t)||t<1||t>64)throw new f(`WAV header: channels ${t} ngoài [1,64]`);if(!Number.isInteger(n)||n<1e3||n>768e3)throw new f(`WAV header: sampleRate ${n} ngoài [1000,768000]`);if(![8,16,24,32].includes(r))throw new f(`WAV header: bits ${r} không hỗ trợ (cần 8/16/24/32)`);if(t*r%8!==0)throw new f("WAV header: channels*bits không chia hết cho 8");let o=Math.floor(t*r/8);if(!(o>=1&&o<=65535))throw new f(`WAV header: blockAlign ${o} ngoài [1,65535]`);let s=n*o;if(!Number.isSafeInteger(s)||s<1||s>4294967295)throw new f(`WAV header: byteRate ${s} vượt uint32`);if(36+e>4294967295)throw new f("WAV >4GB cần RF64 — NO-FALLBACK, dùng MP4/M4A thay thế");let i=Buffer.alloc(44);return i.write("RIFF",0,"latin1"),i.writeUInt32LE(36+e,4),i.write("WAVE",8,"latin1"),i.write("fmt ",12,"latin1"),i.writeUInt32LE(16,16),i.writeUInt16LE(1,20),i.writeUInt16LE(t,22),i.writeUInt32LE(n,24),i.writeUInt32LE(s,28),i.writeUInt16LE(o,32),i.writeUInt16LE(r,34),i.write("data",36,"latin1"),i.writeUInt32LE(e,40),i}c(Ze,"wavHeader");function tn(e){let t=It.openSync(e,"r");try{let n=It.fstatSync(t).size,r=Buffer.alloc(12);if(It.readSync(t,r,0,12,0)!==12)throw new f("WAV ngắn hơn RIFF header");if(r.toString("latin1",0,4)!=="RIFF"||r.toString("latin1",8,12)!=="WAVE")throw new f("WAV: RIFF/WAVE magic sai");let o=null,s=null,i=12,a=Buffer.allocUnsafe(8);for(;i+8<=n;){let g=It.readSync(t,a,0,8,i);if(g!==8)throw new f(`WAV đọc hụt header chunk tại ${i} (được ${g}/8B)`);let w=a.toString("latin1",0,4),h=a.readUInt32LE(4);if(w==="data"&&h===0&&(h=n-i-8),i+8+h>n&&w!=="data")break;if(w==="fmt "){if(h<16)throw new f(`WAV: fmt chunk ${h}B quá ngắn (cần ≥16)`);let p=Buffer.alloc(Math.min(h,40)),S=It.readSync(t,p,0,p.length,i+8);if(S!==p.length)throw new f(`WAV đọc hụt fmt tại ${i} (được ${S}/${p.length}B)`);let N=p.readUInt16LE(0),k=p.readUInt16LE(2),x=p.readUInt32LE(4),E=p.readUInt16LE(12),m=p.readUInt16LE(14),y=p.readUInt32LE(8),O=N;if(N===65534&&p.length>=26&&(O=p.readUInt16LE(24)),O!==1)throw new f(`WAV: format ${O} không phải PCM thuần — không hỗ trợ`);if(!Number.isInteger(k)||k<1||k>64)throw new f(`WAV: channels ${k} ngoài [1,64]`);if(!Number.isInteger(x)||x<1e3||x>768e3)throw new f(`WAV: sampleRate ${x} ngoài [1000,768000]`);if(!E||E>65535)throw new f(`WAV: blockAlign ${E} vô lý`);if(![8,16,24,32].includes(m))throw new f(`WAV: bits ${m} không hỗ trợ (cần 8/16/24/32)`);if(E!==k*m/8)throw new f(`WAV: blockAlign ${E} ≠ channels*bits/8 (${k*m/8})`);if(y!==x*E)throw new f(`WAV: byteRate ${y} ≠ sampleRate*blockAlign`);o={channels:k,sampleRate:x,blockAlign:E,bits:m}}else w==="data"&&(s={pos:i+8,size:Math.min(h,n-i-8)});i+=8+h+h%2}if(!o||!s)throw new f("WAV: thiếu fmt hoặc data chunk");if(s.size<=0)throw new f("WAV: data rỗng — không có frame nào");if(o.blockAlign%o.channels!==0)throw new f("WAV: blockAlign không khớp channels");let l=Math.floor(s.size/o.blockAlign),u=o.sampleRate,d={codec:"pcm",channels:o.channels,bits:o.bits,blockAlign:o.blockAlign,sampleRate:u,auCount:l,contiguous:!0,durationS:l/u,auDtsS:c(g=>{if(!Number.isInteger(g)||g<0||g>=l)throw new f(`frame ${g} ngoài phạm vi`);return g/u},"auDtsS"),auIndexAtS:c(g=>g>0?Math.max(0,Math.min(l-1,Math.floor(g*u))):0,"auIndexAtS"),auLocation:c(g=>{if(!Number.isInteger(g)||g<0||g>=l)throw new f(`frame ${g} ngoài phạm vi`);return{pos:s.pos+g*o.blockAlign,size:o.blockAlign}},"auLocation"),*iterateAus(g=0,w=l){if(!Number.isInteger(g)||!Number.isInteger(w))throw new f(`WAV iterateAus [${g},${w}) không phải số nguyên`);if(g<0||w>l||w<g)throw new f(`WAV iterateAus [${g},${w}) ngoài [0,${l}]`);for(let h=g;h<w;h++)yield{index:h,pos:s.pos+h*o.blockAlign,size:o.blockAlign,dtsS:h/u}}};return{kind:"wav",durationS:d.durationS,track:d}}finally{It.closeSync(t)}}c(tn,"inspectWav");var Pr=new Set(["ftyp","moov","mdat","free","skip","wide","pnot","uuid"]),Or=new Set(["styp","moof","sidx","emsg","prft"]);function Bt(e){let t;try{t=Kt.openSync(e,"r")}catch(a){throw new f(`Không mở được file: ${e} (${a?.code??a?.message??a})`,{cause:a})}let n,r=0;try{if(n=Buffer.alloc(16),r=Kt.readSync(t,n,0,16,0),r<=0)throw new f(`File rỗng: ${e}`)}finally{Kt.closeSync(t)}if(r>=4&&n.toString("latin1",0,4)==="RF64")throw new f("RF64 (>4GB WAV) chưa hỗ trợ — dùng MP4/M4A chứa AAC — NO-FALLBACK");let o=r>=8?n.toString("latin1",4,8):"";if(Or.has(o))throw new f(`MP4 phân mảnh (top-level '${o}') — thiếu moov, cần file MP4/MOV/M4A progressive — NO-FALLBACK`);let s;if(Pr.has(o)){let a=r>=4?n.readUInt32BE(0):0;if(!(a===0||a===1||a>=8)){let l=Math.max(0,Math.min(8,r));throw new f(`Định dạng không nhận diện được (magic ${n.subarray(0,l).toString("hex")||"rỗng"}). Hỗ trợ: MP4/MOV/M4A (AAC/MP3), MP3, WAV — NO-FALLBACK`)}try{s=Ve(e)}catch(l){throw l instanceof f?l:new f(`MP4 hỏng: ${l?.message??l}`,{cause:l})}}else if(n.toString("latin1",0,4)==="RIFF"&&n.toString("latin1",8,12)==="WAVE")try{s=tn(e)}catch(a){throw a instanceof f?a:new f(`WAV hỏng: ${a?.message??a}`,{cause:a})}else if(n.toString("latin1",0,3)==="ID3"||r>=2&&n[0]===255&&(n[1]&224)===224){if(r>=2&&n[0]===255&&(n[1]&246)===240&&(n[1]&6)===0&&n.toString("latin1",0,3)!=="ID3")throw new f("Raw AAC/ADTS (.aac) chưa hỗ trợ — dùng MP4/M4A chứa AAC — NO-FALLBACK");try{s=Qe(e)}catch(l){throw l instanceof f?l:new f(`MP3 hỏng: ${l?.message??l}`,{cause:l})}}else{let a=Math.max(0,Math.min(8,r));throw new f(`Định dạng không nhận diện được (magic ${n.subarray(0,a).toString("hex")||"rỗng"}). Hỗ trợ: MP4/MOV/M4A (AAC/MP3), MP3, WAV — NO-FALLBACK`)}let i;try{i=Kt.statSync(e).size}catch(a){throw new f(`Không stat được file: ${e} (${a?.code??a?.message??a})`,{cause:a})}return{...s,path:e,fileSize:i}}c(Bt,"inspectMedia");var Nt=class{static{c(this,"CancelToken")}#t=!1;#e=new Set;cancel(){if(this.#t)return;this.#t=!0;let t=[...this.#e];this.#e.clear();for(let n of t)try{n()}catch{}}reset(){this.#t=!1,this.#e.clear()}onCancel(t){if(typeof t!="function")return()=>{};if(this.#t){try{t()}catch{}return()=>{}}return this.#e.add(t),()=>{this.#e.delete(t)}}bind(t){if(!t||typeof t.addEventListener!="function")return t?.aborted&&this.cancel(),()=>{};if(t.aborted)return this.cancel(),()=>{};let n=c(()=>this.cancel(),"onAbort");return t.addEventListener("abort",n,{once:!0}),()=>{try{t.removeEventListener("abort",n)}catch{}}}get cancelled(){return this.#t}check(){if(this.#t)throw new et("Đã hủy theo yêu cầu")}};import en from"node:path";var Et=.5,At=1.5,pt=1,Lr=/^[+-]?(\d+\.?\d*|\.\d+)$/;function mt(e=pt){if(e==null)return pt;let t;if(typeof e=="number")t=e;else if(typeof e=="string"){let r=e.trim().replace(/[x×]$/i,"").trim();if(!r||!Lr.test(r))throw new f(`Tốc độ video không hợp lệ: ${JSON.stringify(e)} (cần ${Et}x – ${At}x)`);t=Number(r)}else throw new f(`Tốc độ video không hợp lệ: ${JSON.stringify(e)} (cần ${Et}x – ${At}x)`);if(!Number.isFinite(t)||t<Et-1e-9||t>At+1e-9)throw new f(`Tốc độ video phải nằm trong khoảng ${Et}x – ${At}x (nhận: ${e})`);let n=Math.min(At,Math.max(Et,t));return Math.round(n*1e6)/1e6}c(mt,"normalizeSpeed");function nn(e,t,n){if(!Number.isFinite(e)||!Number.isFinite(t))throw new TypeError(`${n}: start/end must be finite numbers (got ${e}, ${t})`)}c(nn,"assertFinite");function rn(e,t){let n=String(e??"").trim();if(!n)throw new TypeError(`${t}: text must be non-empty after trim`);return n}c(rn,"cleanText");function Ee({start:e,end:t,text:n,probability:r=null}){return nn(e,t,"Word"),Object.freeze({start:e,end:t,text:rn(n,"Word"),probability:r})}c(Ee,"Word");function St({start:e,end:t,text:n,words:r=[],rawStartMs:o=null,rawEndMs:s=null}){return nn(e,t,"Segment"),Object.freeze({start:e,end:t,text:rn(n,"Segment"),words:Object.freeze([...r??[]]),rawStartMs:o,rawEndMs:s})}c(St,"Segment");function Xt({index:e,start:t,end:n,coreStart:r,coreEnd:o,path:s,crcHex:i=null,bytes:a=0}){return Object.freeze({index:e,start:t,end:n,coreStart:r,coreEnd:o,path:s,crcHex:i,bytes:a})}c(Xt,"Chunk");function Ae({inputPath:e,outputPath:t,model:n="JianYing ORIGINAL 1:1 · client 10.9",language:r=null,maxChars:o=42,softMaxChars:s=56,mergeGapS:i=1.5,maxDuration:a=7,minDuration:l=5/6,cps:u=20,gapMs:d=84,jianyingAppVersion:g="10.9.0",maxWorkers:w=null,speed:h=pt,formats:p=["srt"],physicalSpeed:S=null,srtOnly:N=!1,noJunk:k=!1}){let x=mt(h);return Object.freeze({inputPath:en.resolve(String(e)),outputPath:en.resolve(String(t)),model:n,language:r,maxChars:o,softMaxChars:s,mergeGapS:i,maxDuration:a,minDuration:l,cps:u,gapMs:d,jianyingAppVersion:g,maxWorkers:w,speed:x,formats:Array.isArray(p)?Object.freeze([...p]):Object.freeze(["srt"]),physicalSpeed:S===null?null:!!S,srtOnly:!!(N||k),noJunk:!!(N||k)})}c(Ae,"Options");function on({outputPath:e,segments:t,language:n,languageProbability:r,elapsed:o,speed:s=pt}){return Object.freeze({outputPath:e,segments:Object.freeze([...t]),language:n,languageProbability:r,elapsed:o,speed:mt(s)})}c(on,"Result");import kt from"node:fs";import To from"node:os";import Je from"node:path";import Sn from"node:path";import gt from"node:fs";import $e from"node:path";import Me from"node:fs";import*as _e from"node:zlib";var sn=typeof _e.crc32=="function"?_e.crc32:null,Qt=null;function Fr(){if(Qt)return Qt;let e=new Uint32Array(256*8);for(let t=0;t<256;t++){let n=t;for(let r=0;r<8;r++)n=n&1?3988292384^n>>>1:n>>>1;e[t]=n>>>0}for(let t=0;t<256;t++)for(let n=1;n<8;n++){let r=e[(n-1)*256+t];e[n*256+t]=(r>>>8^e[r&255])>>>0}return Qt=e,e}c(Fr,"initSlice8Table");function an(e){return typeof e=="string"?Buffer.from(e,"utf8"):Buffer.isBuffer(e)?e:ArrayBuffer.isView(e)?Buffer.from(e.buffer,e.byteOffset,e.byteLength):Buffer.from(String(e),"utf8")}c(an,"toBytes");function Br(e,t=0){let n=an(e),r=Qt||Fr(),o=(t^-1)>>>0,s=0,i=n.length;for(;s+8<=i;){let a=n[s]^o&255,l=n[s+1]^o>>>8&255,u=n[s+2]^o>>>16&255,d=n[s+3]^o>>>24;o=r[7*256+a]^r[6*256+l]^r[5*256+u]^r[4*256+d]^r[3*256+n[s+4]]^r[2*256+n[s+5]]^r[1*256+n[s+6]]^r[n[s+7]],s+=8}for(;s<i;)o=(r[(o^n[s])&255]^o>>>8)>>>0,s++;return(o^-1)>>>0}c(Br,"fallbackCrc32");function ke(e,t=0){let n=an(e);return sn?sn(n,t)>>>0:Br(n,t)}c(ke,"crc32");function cn(e,t=1<<20){let n=Me.openSync(e,"r");try{let r=0,o=Buffer.allocUnsafe(t);for(;;){let s=Me.readSync(n,o,0,t,null);if(s===0)break;r=ke(o.subarray(0,s),r)}return(r>>>0).toString(16).padStart(8,"0")}finally{Me.closeSync(n)}}c(cn,"crc32FileHex");import Ie from"node:os";function Dr(){try{if(typeof Ie.availableParallelism=="function"){let e=Ie.availableParallelism();if(Number.isFinite(e)&&e>0)return Math.trunc(e)}}catch{}return Ie.cpus()?.length||4}c(Dr,"cpuParallelism");function jr(){let e=Dr();return Math.max(4,Math.min(12,e*2))}c(jr,"defaultMaxWorkers");var fn=/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/,dn=/^[+-]?\d+$/,ln=new Set;function ut(e,t,n){if(!ln.has(e)){ln.add(e);try{console.warn(`[config] env ${e}=${JSON.stringify(t)} invalid — using ${n}`)}catch{}}}c(ut,"warnInvalidEnv");function hn(e,t,n,r,o,s){let i=process.env[e];if(i===void 0)return t<<o;let a=Number.parseInt(String(i).trim(),10);return!Number.isFinite(a)||a<n||a>r?(ut(e,i,`${t}${s} (range ${n}–${r}${s})`),t<<o):a<<o}c(hn,"envBytes");function Ur(e,t,n,r){return hn(e,t,n,r,20,"MB")}c(Ur,"envIntMB");function Zt(e,t){let n=process.env[e];if(n===void 0)return t;let r=String(n).trim();return r||(ut(e,n,`default ${JSON.stringify(t)}`),t)}c(Zt,"envString");function un(e,t,{min:n=0,max:r=Number.POSITIVE_INFINITY}={}){let o=process.env[e];if(o===void 0)return t;let s=String(o).trim().toLowerCase();if(!fn.test(s))return ut(e,o,String(t)),t;let i=Number(s);return!Number.isFinite(i)||i<n||i>r?(ut(e,o,String(t)),t):i}c(un,"envPositiveFloat");function Ne(e,t,{min:n=1,max:r=Number.MAX_SAFE_INTEGER}={}){let o=process.env[e];if(o===void 0)return t;let s=String(o).trim().toLowerCase();if(!dn.test(s))return ut(e,o,String(t)),t;let i=Number.parseInt(s,10);return!Number.isFinite(i)||i<n||i>r?(ut(e,o,String(t)),t):i}c(Ne,"envPositiveInt");function zr(e,t){let n=process.env[e];if(n===void 0)return t;let r=n.trim().toLowerCase();return r===""?!1:!["0","false","no","off"].includes(r)}c(zr,"envBool");function te(e,t){let n=process.env[e];if(n===void 0)return t;let r=n.trim().toLowerCase();if(["","none","null","off","0","inf","infinite","forever"].includes(r))return null;if(!fn.test(r))return ut(e,n,t===null?"null (wait forever)":String(t)),t;let o=Number(r);return Number.isFinite(o)?o<=0?null:o:(ut(e,n,t===null?"null (wait forever)":String(t)),t)}c(te,"envFloat");function Jr(e,t){let n=process.env[e];if(n===void 0)return t;let r=n.trim().toLowerCase();if(["","none","null","off","inf","infinite","forever"].includes(r))return 0;if(!dn.test(r))return ut(e,n,String(t)),t;let o=Number.parseInt(r,10);return o<0?0:o}c(Jr,"envInt");function Te(e,t){return e==null?t==null?null:[null,t]:[e,t??null]}c(Te,"httpTimeout");var F=Object.freeze({CHUNK_CORE_S:480,OVERLAP_S:8,SILENCE_WINDOW:55,SILENCE_NOISE_DB:-38,SILENCE_MIN_D:.4,SILENCE_DETECT:zr("ASR_SILENCE",!0),SPAN_BYTES:Ur("ASR_SPAN_MB",8,1,64),OUT_BUF_BYTES:hn("ASR_OUTBUF_KB",256,64,4096,10,"KB"),UPLOAD_HWM_BYTES:1<<20,POOL_SIZE:32,JY_CONNECT_TO:te("ASR_JY_CONNECT",null),JY_POLL_READ_TO:te("ASR_JY_POLL_READ",null),JY_LONG_READ_TO:te("ASR_JY_LONG_READ",null),JY_UPLOAD_READ_TO:te("ASR_JY_UPLOAD_READ",null),JY_POLL_MIN_S:un("ASR_JY_POLL_MIN_S",.35,{min:.01,max:60}),JY_POLL_MAX_S:un("ASR_JY_POLL_MAX_S",1.5,{min:.01,max:60}),JY_POLL_MAX_ATTEMPTS:Jr("ASR_JY_POLL_ATTEMPTS",0),JY_APPVR:Zt("ASR_JY_APPVR","10.9.0"),JY_CAPTION_TYPE:Ne("ASR_JY_CAPTION_TYPE",2,{min:1,max:10}),JY_WORDS_PER_LINE:Ne("ASR_JY_WORDS_PER_LINE",16,{min:1,max:100}),JY_ADJUST_ENDTIME:Ne("ASR_JY_ADJUST_ENDTIME",200,{min:0,max:1e4}),JY_BASE:Zt("ASR_JY_BASE","https://lv-pc-api-sinfonlinec.ulikecam.com"),JY_SIGN_UA:Zt("ASR_JY_SIGN_UA","Cronet/TTNetVersion:d4572e53 2024-06-12 QuicVersion:4bf243e0 2023-04-17"),JY_UPLOAD_UA:Zt("ASR_JY_UPLOAD_UA","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Thea/1.0.1"),AUDIO_CHANNELS:1,AUDIO_SAMPLE_RATE:16e3,AUDIO_BITRATE:"64k",CIRCUIT_FAILS:8,CIRCUIT_RESET_S:45,RATE_RPS:8,jyTimeout(e="poll"){return e==="upload"?Te(this.JY_CONNECT_TO,this.JY_UPLOAD_READ_TO):e==="long"?Te(this.JY_CONNECT_TO,this.JY_LONG_READ_TO):Te(this.JY_CONNECT_TO,this.JY_POLL_READ_TO)},maxWorkers(e=null){if(e!=null){let n=Math.trunc(Number(e));if(Number.isFinite(n)&&n>0)return Math.min(n,16);ut("maxWorkers(override)",e,"auto")}let t=process.env.ASR_MAX_WORKERS;if(t!==void 0){let n=Number.parseInt(String(t).trim(),10);if(Number.isFinite(n)&&n>0)return Math.min(n,16);ut("ASR_MAX_WORKERS",t,"auto")}return jr()}});var Tt=F.SPAN_BYTES,ee=F.OUT_BUF_BYTES,Ce=class{static{c(this,"OutputWriter")}#t;#e;#n=0;#o=0;size=0;constructor(t){gt.mkdirSync($e.dirname(String(t)),{recursive:!0}),this.#t=gt.openSync(t,"w"),this.#e=Buffer.allocUnsafe(ee)}push(t){if(t.length>=ee){this.#i(),this.#r(t);return}this.#n+t.length>ee&&this.#i(),t.copy(this.#e,this.#n),this.#n+=t.length}pushAdtsHeader(t,n,r,o){if(!Number.isInteger(t)||t<0||t>12)throw new f(`ADTS freqIdx ${t} ngoài [0,12]`);if(!Number.isInteger(n)||n<1||n>7)throw new f(`ADTS chanCfg ${n} ngoài [1,7]`);if(!Number.isInteger(r)||r<0||r>3)throw new f(`ADTS profile ${r} ngoài [0,3]`);let s=o+7;if(s>8191)throw new f(`AU ${o}B vượt ADTS frame limit`);this.#n+7>ee&&this.#i();let i=this.#e,a=this.#n;i[a]=255,i[a+1]=241,i[a+2]=r<<6|t<<2|n>>2&1,i[a+3]=(n&3)<<6|s>>11&3,i[a+4]=s>>3&255,i[a+5]=(s&7)<<5|31,i[a+6]=252,this.#n+=7}#i(){this.#n!==0&&(this.#r(this.#e.subarray(0,this.#n)),this.#n=0)}#r(t){let n=0;for(;n<t.length;){let r=gt.writeSync(this.#t,t,n,t.length-n,null);if(!(r>0))throw new f(`cut: ghi hụt tại offset ${n}/${t.length}`);n+=r}this.#o=ke(t,this.#o),this.size+=t.length}finish(){return this.#i(),gt.closeSync(this.#t),this.#t=-1,{size:this.size,crcHex:(this.#o>>>0).toString(16).padStart(8,"0")}}abort(){try{this.#t!==-1&&gt.closeSync(this.#t)}catch{}this.#t=-1}};async function Re(e,t,{token:n=null,onDone:r=null}={}){if(!Array.isArray(t)||t.length===0)return[];let o=e?.track;if(!o||!Number.isInteger(o.auCount)||o.auCount<=0)throw new f("cut: meta.track thiếu hoặc auCount vô lý");if(typeof o.auLocation!="function")throw new f("cut: track.auLocation thiếu");let s=new Set(["adts","raw","wav"]),i=new Set,a=e.fileSize;for(let u of t){if(!Number.isInteger(u.fromAu)||!Number.isInteger(u.toAuExcl)||u.fromAu<0||u.toAuExcl<=u.fromAu)throw new f(`cut: range [${u.fromAu},${u.toAuExcl}) không hợp lệ`);if(u.fromAu>=o.auCount)throw new f(`cut: range [${u.fromAu},${u.toAuExcl}) ngoài [0,${o.auCount})`);if(u.toAuExcl>o.auCount)throw new f(`cut: range [${u.fromAu},${u.toAuExcl}) vượt auCount ${o.auCount}`);if(!s.has(u.wrap))throw new f(`cut: wrap '${u.wrap}' không hỗ trợ (cần adts/raw/wav)`);if(typeof u.outPath!="string"||u.outPath.length===0)throw new f("cut: outPath thiếu");let d=$e.resolve(String(u.outPath));if(i.has(d))throw new f(`cut: outPath trùng lặp ${u.outPath}`);if(i.add(d),d===$e.resolve(String(e.path)))throw new f("cut: outPath trùng source — từ chối self-overwrite")}for(let u of t)if(u.wrap==="adts"){if(e.kind!=="mp4-aac"||o.codec!=="aac")throw new f(`cut: wrap adts cần track AAC (nhận kind ${e.kind})`);if(ve(o.audioObjectType),!Number.isInteger(o.freqIdx)||!Number.isInteger(o.chanCfg))throw new f("cut: track AAC thiếu freqIdx/chanCfg cho ADTS")}else if(u.wrap==="wav"){if(e.kind!=="wav"||o.codec!=="pcm")throw new f(`cut: wrap wav cần track PCM (nhận kind ${e.kind})`);if(!o.channels||!o.sampleRate||!o.bits)throw new f("cut: track PCM thiếu channels/sampleRate/bits cho WAV")}let l=gt.openSync(e.path,"r");try{try{a=gt.fstatSync(l).size}catch{}let u=Buffer.allocUnsafe(Tt),d=-1,g=-1,w=c($=>{let T=Math.max(0,Math.min($,a-1)),A=Math.min(a,T+Tt);if(A<=T)throw new f(`cut: span rỗng tại ${T}`);let M=0;for(;M<A-T;){let b=gt.readSync(l,u,M,A-T-M,T+M);if(b<=0)throw new f(`cut: đọc hụt tại ${T+M}`);M+=b}d=T,g=A},"loadSpan"),h=c(($,T)=>{if(T>Tt)throw new f(`cut: run ${T}B vượt span`);return($<d||$+T>g)&&w($),u.subarray($-d,$-d+T)},"viewAt"),p=t.map(($,T)=>({r:$,i:T})).sort(($,T)=>$.r.fromAu-T.r.fromAu||$.r.toAuExcl-T.r.toAuExcl),S=new Array(t.length),N=new Set;for(let{r:$}of p)N.add(Math.min($.fromAu,o.auCount)),N.add(Math.min($.toAuExcl,o.auCount));let k=[...N].sort(($,T)=>$-T).filter($=>$>=0&&$<o.auCount),x=new Map,E=64,m=0,y=0,O=c($=>{for(;m<p.length&&p[m].r.fromAu<=$;){if(x.size>=E)throw new f(`cut: quá nhiều cửa sổ đồng thời (>${E}) — chia batch`);let{r:T}=p[m],A=new Ce(T.outPath),M;if(T.wrap==="adts"){let b=e.track;M={kind:"adts",profile:ve(b.audioObjectType),freqIdx:b.freqIdx,chanCfg:b.chanCfg}}else if(T.wrap==="wav"){let b=e.track,_=Math.min(T.toAuExcl,o.auCount),B=b.auLocation(T.fromAu).size;M={kind:"wav",header:Ze((_-T.fromAu)*B,b.channels,b.sampleRate,b.bits)},A.push(M.header)}else M={kind:"raw"};x.set(m,{writer:A,wrap:M,fromAu:T.fromAu,toAu:Math.min(T.toAuExcl,o.auCount)}),m+=1}},"activateUpTo"),C=new Uint32Array(4096),I=c($=>{if($<=C.length)return;let T=C.length;for(;T<$;)T*=2;let A=new Uint32Array(T);A.set(C),C=A},"ensureOffsetsCap");try{for(let $=0;$<k.length;$++){let T=k[$],A=k[$+1]??o.auCount;if(T>=A)continue;for(let[b,_]of[...x])T>=_.toAu&&(S[p[b].i]={path:p[b].r.outPath,..._.writer.finish()},x.delete(b),y+=1,r?.(y,t.length));if(O(T),x.size===0)continue;let M=T;for(;M<A;){let b=o.auLocation(M),_=b.pos,B=b.size,j,J,W=!1;if(o.contiguous&&B>0){let H=Math.max(1,Math.floor(Tt/B));j=Math.min(A,M+H),J=_+(j-M)*B}else{j=M+1,J=_+B,C[0]=0,C[1]=B;let H=1;for(;j<A&&J-_<Tt;){let P=o.auLocation(j);if(P.pos!==J||J+P.size-_>Tt)break;H+=1,I(H+1),J+=P.size,C[H]=J-_,j+=1}W=!0}let Y=h(_,J-_);for(let[,H]of x){let P=Math.max(H.fromAu,M),v=Math.min(H.toAu,j);if(!(P>=v))if(H.wrap.kind==="adts")if(W)for(let R=P;R<v;R++){let D=R-M,L=C[D],U=C[D+1];H.writer.pushAdtsHeader(H.wrap.freqIdx,H.wrap.chanCfg,H.wrap.profile,U-L),H.writer.push(Y.subarray(L,U))}else for(let R=P;R<v;R++){let D=(R-M)*B;H.writer.pushAdtsHeader(H.wrap.freqIdx,H.wrap.chanCfg,H.wrap.profile,B),H.writer.push(Y.subarray(D,D+B))}else if(W){let R=C[P-M],D=C[v-M];H.writer.push(Y.subarray(R,D))}else{let R=(P-M)*B,D=(v-M)*B;H.writer.push(Y.subarray(R,D))}}M=j,n?.check()}n?.check()}for(let[$,T]of[...x])S[p[$].i]={path:p[$].r.outPath,...T.writer.finish()},x.delete($),y+=1,r?.(y,t.length);if(S.some($=>!$))throw new f("cut: có khoảng chưa đóng — bảng sample ngắn hơn dự kiến");return S}catch($){for(let[,T]of[...x])try{T.writer.abort?.()}catch{}for(let{r:T}of p)try{gt.rmSync(T.outPath,{force:!0})}catch{}throw $}}finally{gt.closeSync(l)}}c(Re,"cutUnits");function pn(e,t,n,r,o,s=null){let i=s??F.OVERLAP_S;if(!(n>0&&Number.isFinite(n)))throw new f("planOverlap: duration invalid");if(!Number.isInteger(r)||!Number.isInteger(o)||r<0||r>=o)throw new f("planOverlap: index/count invalid");if(!(e>=0&&t>=e&&t<=n))throw new f("planOverlap: core window invalid");if(!(i>=0&&Number.isFinite(i)))throw new f("planOverlap: overlap invalid");let a=Math.max(0,e-(r?i:0)),l=Math.min(n,t+(r<o-1?i:0));return[a,l]}c(pn,"planOverlap");import{spawn as Gr}from"node:child_process";import{spawn as Hr,spawnSync as Wr}from"node:child_process";import Dt from"node:fs";import mn from"node:os";import Pe from"node:path";var $t;function ne(){if($t!==void 0)return $t;if(process.env.FFMPEG_PATH&&Dt.existsSync(process.env.FFMPEG_PATH))return $t=process.env.FFMPEG_PATH;try{if(Wr("ffmpeg",["-version"],{stdio:"ignore",windowsHide:!0}).status===0)return $t="ffmpeg"}catch{}let e=["C:\\ffmpeg\\bin\\ffmpeg.exe","C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe","C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",Pe.join(mn.homedir(),"ffmpeg","bin","ffmpeg.exe"),Pe.join(mn.homedir(),"AppData","Local","Microsoft","WinGet","Links","ffmpeg.exe"),"D:\\ffmpeg\\bin\\ffmpeg.exe"];for(let t of e)try{if(Dt.existsSync(t))return $t=t}catch{}return $t=null}c(ne,"getFfmpegPath");function gn(){return ne()!==null}c(gn,"isFfmpegAvailable");function Yr(e){if(e>=.5&&e<=2)return`atempo=${e.toFixed(4)}`;let t=[],n=e;for(;n<.5;)t.push("atempo=0.5"),n/=.5;for(;n>2;)t.push("atempo=2.0"),n/=2;return t.push(`atempo=${n.toFixed(4)}`),t.join(",")}c(Yr,"buildAtempoFilter");async function wn(e,t,n=.8,{token:r=null,sampleRate:o=16e3}={}){let s=mt(n);if(Math.abs(s-1)<1e-6)return e!==t&&Dt.copyFileSync(e,t),t;let i=ne();if(!i)throw new f(`Không tìm thấy FFmpeg để chuyển đổi âm thanh chuẩn ${s}x. Vui lòng cài đặt FFmpeg hoặc cấu hình biến FFMPEG_PATH.`);let a=Yr(s),l=Pe.extname(t).toLowerCase(),w=["-nostdin","-y","-i",e,"-vn","-filter:a",a,...l===".wav"?["-c:a","pcm_s16le"]:l===".aac"||l===".m4a"?["-c:a","aac","-b:a","128k"]:["-c:a","libmp3lame","-q:a","2"],"-ar",String(o),"-ac","1",t];return new Promise((h,p)=>{let S;try{S=Hr(i,w,{stdio:["ignore","pipe","pipe"],windowsHide:!0})}catch(x){return p(new f(`Không thể khởi chạy FFmpeg: ${x.message}`,{cause:x}))}let N="";S.stderr.on("data",x=>{N+=x.toString()});let k=c(()=>{try{S.kill("SIGKILL")}catch{}},"onCancel");if(r){if(r.cancelled)return k(),p(new f("Chuyển đổi âm thanh bị hủy bởi người dùng"));r.onCancel?.(k)}S.on("close",x=>{x===0&&Dt.existsSync(t)&&Dt.statSync(t).size>0?h(t):r?.cancelled?p(new f("Chuyển đổi âm thanh bị hủy bởi người dùng")):p(new f(`Chuyển đổi âm thanh ${s}x thất bại (mã ${x}): ${N.slice(-300)||"không rõ nguyên nhân"}`))}),S.on("error",x=>{p(new f(`Lỗi tiến trình FFmpeg: ${x.message}`,{cause:x}))})})}c(wn,"convertAudioSpeed");async function qr(e,{noiseDb:t=F.SILENCE_NOISE_DB,minDuration:n=F.SILENCE_MIN_D,token:r=null}={}){let o=ne();return!o||!e?[]:new Promise(s=>{let i=["-nostdin","-i",e,"-af",`silencedetect=noise=${t}dB:d=${n}`,"-f","null","-"],a;try{a=Gr(o,i,{stdio:["ignore","ignore","pipe"],windowsHide:!0})}catch{return s([])}let l="";a.stderr.on("data",d=>{l+=d.toString()});let u=c(()=>{try{a.kill("SIGKILL")}catch{}},"onCancel");if(r){if(r.cancelled)return u(),s([]);r.onCancel?.(u)}a.on("close",d=>{let g=[],w=l.split(/\r?\n/),h=null;for(let p of w){let S=/silence_start:\s*([0-9.]+)/.exec(p);if(S){h=Number(S[1]);continue}let N=/silence_end:\s*([0-9.]+)/.exec(p);if(N&&h!==null){let k=Number(N[1]);k>h&&Number.isFinite(k)&&Number.isFinite(h)&&g.push(Math.round((h+k)/2*1e3)/1e3),h=null}}g.sort((p,S)=>p-S),s(g)}),a.on("error",()=>s([]))})}c(qr,"detectSilenceWithFfmpeg");async function Vr(e,{token:t=null}={}){if(!e||typeof e!="object")throw new f("silence: meta thiếu");let n=e.track;if(!n)throw new f("silence: meta.track thiếu");if(n.bits!==16)throw new f(`ASR_SILENCE chỉ hỗ trợ PCM 16-bit (nhận ${n.bits}-bit).`);if(!Number.isInteger(n.channels)||n.channels<1||n.channels>64)throw new f(`silence: channels ${n.channels} ngoài [1,64]`);if(!(n.sampleRate>0&&Number.isFinite(n.sampleRate)))throw new f(`silence: sampleRate ${n.sampleRate} vô lý`);if(!Number.isInteger(n.auCount)||n.auCount<=0)throw new f("silence: auCount vô lý");if(typeof n.auLocation!="function")throw new f("silence: track.auLocation thiếu");let r=await import("node:fs"),o=r.openSync(e.path,"r");try{let i=Math.max(1,Math.round(n.sampleRate*.03))*n.channels*2,l=Math.max(1,Math.floor((1<<20)/i))*i,u=Buffer.allocUnsafe(l),d=Math.pow(10,F.SILENCE_NOISE_DB/20)*32767,g=n.auLocation(0).pos,w=n.blockAlign??n.channels*2,h=g+n.auCount*w,p=0,S=null,N=[],k=c((E,m)=>{let y=Math.floor(m/2),O=0;for(let $=0;$<y;$++){let T=E+$*2,A=u[T]|u[T+1]<<8;A&32768&&(A-=65536),O+=A*A}let I=Math.sqrt(O/Math.max(1,y))<d;I&&S===null&&(S=p),!I&&S!==null&&(p-S>=F.SILENCE_MIN_D&&N.push((S+p)/2),S=null),p+=y/n.channels/n.sampleRate},"processWindow"),x=0;for(;g<h;){let E=Math.min(l,h-g),m=0;for(;m<E;){let O=r.readSync(o,u,m,E-m,g+m);if(O<=0)throw new f("WAV đọc hụt khi quét silence");m+=O}let y=0;for(;y<E;){let O=Math.min(i,E-y);k(y,O),y+=O,x+=1,t&&(x&255)===0&&t.check()}g+=E,t?.check()}return S!==null&&p-S>=F.SILENCE_MIN_D&&N.push((S+p)/2),N}finally{r.closeSync(o)}}c(Vr,"detectWavSilenceRMS");async function bn(e,{token:t=null}={}){if(!F.SILENCE_DETECT)return[];if(!e||typeof e!="object")throw new f("silence: meta thiếu");if(e.path)try{let n=await qr(e.path,{noiseDb:F.SILENCE_NOISE_DB,minDuration:F.SILENCE_MIN_D,token:t});if(Array.isArray(n)&&n.length>0)return n}catch{}return e.kind==="wav"?Vr(e,{token:t}):[]}c(bn,"detectSilenceMidpoints");function yn(e,t,n=null,r=null){let o=n??F.CHUNK_CORE_S,s=r??F.SILENCE_WINDOW;if(!(e>0&&Number.isFinite(e)))throw new f("duration must be positive finite");if(!(o>0&&Number.isFinite(o)))throw new f("chunk must be positive finite");if(!(s>=0&&Number.isFinite(s)))throw new f("window must be finite non-negative");if(!Array.isArray(t))throw new f("silences phải là mảng số giây");for(let d=0;d<t.length;d++){let g=t[d];if(!(typeof g=="number"&&Number.isFinite(g)&&g>=0&&g<=e))throw new f(`silences[${d}]=${g} ngoài [0,${e}]`);if(d>0&&!(g>=t[d-1]))throw new f(`silences không sắp xếp tại [${d-1},${d}] (${t[d-1]} > ${g})`)}let i=[0],a=o,l=.5,u=.2;for(;a<e;){let d=i[i.length-1]+o*l,g=t.filter(h=>h>=d&&h<e&&Math.abs(h-a)<=s);g.length===0&&t.length>0&&(g=t.filter(h=>h>=d&&h<e&&Math.abs(h-a)<=s*1.5));let w;g.length>0?w=g.reduce((h,p)=>Math.abs(p-a)<Math.abs(h-a)?p:h):w=a,w<=i[i.length-1]+o*u&&(w=Math.min(e,i[i.length-1]+o)),i.push(w),a=w+o}if(i.push(e),i.length>2){let d=e-i[i.length-2],g=Math.min(o*.1,s*.5);d<g&&i.splice(i.length-2,1)}return i}c(yn,"boundaries");var re=Number.MAX_SAFE_INTEGER,Oe=class e{static{c(this,"MetricsRegistry")}#t=new Map;#e=new Map;incr(t,n=1){if(!Number.isFinite(n)||n===0)return;let r=(this.#t.get(t)??0)+n;this.#t.set(t,Number.isFinite(r)?Math.min(r,re):re)}addTimeMs(t,n){if(!Number.isFinite(n)||n<=0)return;let r=(this.#e.get(t)??0)+n;this.#e.set(t,Number.isFinite(r)?Math.min(r,re):re)}async time(t,n){let r=performance.now();try{return await n()}finally{this.addTimeMs(t,performance.now()-r)}}reset(){this.#t.clear(),this.#e.clear()}fork(){let t=new e;for(let[n,r]of this.#t)t.#t.set(n,r);for(let[n,r]of this.#e)t.#e.set(n,r);return t}snapshot(){return{counters:Object.fromEntries(this.#t),timers_ms:Object.fromEntries(this.#e)}}snapshotDelta(t){let n=t?.counters??{},r=t?.timers_ms??{},o={};for(let[i,a]of this.#t)o[i]=a-(n[i]??0);let s={};for(let[i,a]of this.#e)s[i]=a-(r[i]??0);return{counters:o,timers_ms:s}}},G=new Oe;var xn=new Map([["mp4-aac","aac"],["mp4-mp3","mp3"],["mp3","mp3"],["wav","wav"]]),vn=new Map([["mp4-aac","adts"],["mp4-mp3","raw"],["mp3","raw"],["wav","wav"]]),oe=class{static{c(this,"AdaptiveChunker")}#t;#e;constructor(t,n=()=>{}){this.#t=t,this.#e=n}async split(t,n){let r=this.#t,o=this.#e;if(!t||typeof t!="object")throw new f("chunker: meta thiếu");let s=t.track;if(!s||!Number.isInteger(s.auCount)||s.auCount<=0)throw new f("chunker: meta.track thiếu hoặc auCount vô lý");if(!(t.durationS>0&&Number.isFinite(t.durationS)))throw new f("chunker: meta.durationS vô lý");if(typeof s.auIndexAtS!="function"||typeof s.auCount!="number")throw new f("chunker: track thiếu accessor auIndexAtS/auCount");r.check();let i;F.SILENCE_DETECT?(o(12,"Quét silence & khoảng lặng giọng nói (VAD đa ngôn ngữ)…"),i=await G.time("silence_scan_ms",()=>bn(t,{token:r})),i.length>0&&o(13,`Tìm thấy ${i.length} điểm lặng âm thanh · lên lịch cắt tại vùng không có voice…`)):(o(12,"Turbo cut · mốc cố định (bỏ silence)…"),i=[]);let a=t.durationS,l=yn(a,i);{let x=Math.min(F.CHUNK_CORE_S*.1,F.SILENCE_WINDOW*.5);l.length>2&&a-l[l.length-2]<x&&(l=[...l.slice(0,-2),a])}let u=Math.max(1,l.length-1),d=vn.get(t.kind);if(!d)throw new f(`chunker: kind ${t.kind} chưa hỗ trợ wrap`);let g=xn.get(t.kind);if(!g)throw new f(`chunker: kind ${t.kind} thiếu ext`);let w=[],h=[],p=1e-9,S=typeof s.auDtsS=="function";for(let x=0;x<u;x++){let[E,m]=[l[x],l[x+1]],y=x>0&&i.some(_=>Math.abs(_-E)<.15),O=x<u-1&&i.some(_=>Math.abs(_-m)<.15),C,I;y&&O?(C=E,I=m):y?(C=E,I=Math.min(a,m+(x<u-1?F.OVERLAP_S:0))):O?(C=Math.max(0,E-(x?F.OVERLAP_S:0)),I=m):[C,I]=pn(E,m,a,x,u);let $=s.auIndexAtS(C),T=I>=a-p?s.auCount:Math.min(s.auCount,Math.max($+1,s.auIndexAtS(I))),A=S&&$>0?s.auDtsS($):C,M=S&&T<s.auCount?Math.max(A+1e-6,s.auDtsS(T)):I,b=Sn.join(String(n),`chunk-${String(x+1).padStart(4,"0")}.${g}`);w.push({fromAu:$,toAuExcl:T,outPath:b,wrap:d}),h.push(Xt({index:x,start:A,end:M,coreStart:E,coreEnd:m,path:b}))}o(14,`Cắt ${u} đoạn passthrough · thuần NodeJS · 1 lượt đọc duy nhất`);let N=performance.now(),k=await G.time("split_passthrough_ms",()=>Re(t,w,{token:r,onDone:c((x,E)=>{o(14+Math.round(12*x/Math.max(1,E)),`Đoạn ${x}/${E} · byte-surgery ${performance.now()-N|0}ms`)},"onDone")}));for(let x=0;x<h.length;x++)h[x]=Xt({...h[x],crcHex:k[x].crcHex,bytes:k[x].size});return G.incr("chunks_split",u),o(26,`Tách xong ${u} đoạn · passthrough gốc, không re-encode`),h}async singleOriginal(t,n){if(this.#t.check(),!t||typeof t!="object")throw new f("chunker: meta thiếu");if(!t.track||!Number.isInteger(t.track.auCount)||t.track.auCount<=0)throw new f("chunker: meta.track thiếu hoặc auCount vô lý");if(!(t.durationS>0&&Number.isFinite(t.durationS)))throw new f("chunker: meta.durationS vô lý");let r=xn.get(t.kind);if(!r)throw new f(`chunker: kind ${t.kind} thiếu ext`);let o=vn.get(t.kind);if(!o)throw new f(`chunker: kind ${t.kind} chưa hỗ trợ wrap`);let s=Sn.join(String(n),`original-full.${r}`);this.#e(8,"ORIGINAL 1:1 · trích audio gốc nguyên vẹn (không encode lại)…");let[i]=await G.time("extract_full_ms",()=>Re(t,[{fromAu:0,toAuExcl:t.track.auCount,outPath:s,wrap:o}],{token:this.#t}));return[Xt({index:0,start:0,end:t.durationS,coreStart:0,coreEnd:t.durationS,path:s,crcHex:i.crcHex,bytes:i.size})]}};function ct(e){return new Promise(t=>setTimeout(t,e))}c(ct,"sleep");function se(e,t){if(!Number.isFinite(e)||!Number.isFinite(t)||t<=.01)return"--:--";let n=Math.min(1,Math.max(0,t));if(n<=.01)return"--:--";let r=Math.max(0,e)/n;if(!Number.isFinite(r))return"--:--";let o=Math.max(0,r-Math.max(0,e)),s=Math.trunc(o),i=s%60,a=Math.floor(s/60)%60,l=Math.floor(s/3600);return l?`${l}:${String(a).padStart(2,"0")}:${String(i).padStart(2,"0")}`:`${String(a).padStart(2,"0")}:${String(i).padStart(2,"0")}`}c(se,"formatEta");function En(e,t){if(!Number.isFinite(e)||!Number.isFinite(t)||t<=0)return"0 cue/min";let n=Math.max(0,e)/t*60;return Number.isFinite(n)?`${n.toFixed(1)} cue/min`:"0 cue/min"}c(En,"formatThroughput");function An(e,t){let n=Number.isFinite(e)?e:0,r=Number.isFinite(t)?t:n;return Math.max(n,Math.min(100,r))}c(An,"progressSmooth");var jt=class{static{c(this,"CircuitBreaker")}#t;#e;#n;#o=0;#i=0;#r="closed";#s=!1;#a=null;constructor(t,n=null,r=null,o=null){this.#t=t,this.#e=n??F.CIRCUIT_FAILS,this.#n=r??F.CIRCUIT_RESET_S,this.#a=o??null}get name(){return this.#t}get state(){return this.#r}#c(t){try{this.#a?.onState?.(t,this.#t)}catch{}try{G.incr(`circuit_${t}_${this.#t}`)}catch{}}#l(t){if(this.#r==="open")if(t-this.#i>=this.#n)this.#r="half_open",this.#c("half_open");else throw new yt(`Circuit open: ${this.#t}`);if(this.#r==="half_open"){if(this.#s)throw new yt(`Circuit half-open probe in flight: ${this.#t}`);this.#s=!0}}#u(){this.#o=0,this.#s=!1,this.#r!=="closed"&&this.#c("closed"),this.#r="closed"}#f(t,n){if(t instanceof et||t instanceof yt){this.#r==="half_open"&&(this.#s=!1);return}if(t instanceof X&&t.retryable){this.#r==="half_open"&&(this.#s=!1);return}this.#o+=1,this.#o>=this.#e||this.#r==="half_open"?(this.#r="open",this.#i=n,this.#s=!1,this.#c("open")):this.#r==="half_open"&&(this.#s=!1)}async call(t){this.#l(performance.now()/1e3);try{let n=await t();return this.#u(),n}catch(n){throw this.#f(n,performance.now()/1e3),n}}};import Dn from"node:crypto";import jn from"node:fs";import Le from"node:crypto";var Kr="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";function Mn(e,t){return Le.createHmac("sha256",e).update(t,"utf8").digest()}c(Mn,"hmac");function Xr(e,t,n){let o=Object.entries(n).find(([h])=>String(h).toLowerCase()==="x-amz-date")?.[1];if(!o||!String(o).trim())throw new TypeError("aws4: missing x-amz-date");let s=String(o).split("T")[0],i=Object.entries(n).map(([h,p])=>[String(h).toLowerCase(),String(p).trim()]).sort((h,p)=>h[0]<p[0]?-1:h[0]>p[0]?1:0),a=i.map(([h,p])=>`${h}:${p}`).join(`
`)+`
`,l=i.map(([h])=>h).join(";"),u=`GET
/
${t}
${a}
${l}
${Kr}`,d=`${s}/cn/vod/aws4_request`,g=["AWS4-HMAC-SHA256",o,d,Le.createHash("sha256").update(u,"utf8").digest("hex")].join(`
`),w=Mn(Buffer.from(`AWS4${e}`,"utf8"),s);for(let h of["cn","vod","aws4_request"])w=Mn(w,h);return Le.createHmac("sha256",w).update(g,"utf8").digest("hex")}c(Xr,"aws4VodSignature");function _n(e){let t=Number(e);if(!Number.isFinite(t)||t<0)throw new TypeError("aws4: FileSize must be >= 0, got "+JSON.stringify(e));let n=encodeURIComponent;return["Action="+n("ApplyUploadInner"),"FileSize="+n(String(Math.trunc(t))),"FileType="+n("object"),"IsInner="+n("1"),"SpaceName="+n("lv-mac-recognition"),"Version="+n("2020-11-19"),"s="+n("5y0udbjapi")].join("&")}c(_n,"buildApplyUploadQuery");function kn(e,t,n,r){if(!String(e??"").trim())throw new TypeError("aws4: access key empty");if(!String(t??"").trim())throw new TypeError("aws4: secret key empty");if(!String(n??"").trim())throw new TypeError("aws4: session token empty");let o=new Date,s=c((d,g=2)=>String(d).padStart(g,"0"),"pad"),i=`${o.getUTCFullYear()}${s(o.getUTCMonth()+1)}${s(o.getUTCDate())}T${s(o.getUTCHours())}${s(o.getUTCMinutes())}${s(o.getUTCSeconds())}Z`,a=i.slice(0,8),l={"x-amz-date":i,"x-amz-security-token":String(n)},u=Xr(String(t),r,l);return l.authorization=`AWS4-HMAC-SHA256 Credential=${e}/${a}/cn/vod/aws4_request, SignedHeaders=x-amz-date;x-amz-security-token, Signature=${u}`,l}c(kn,"buildApplyUploadAuthHeaders");async function In(e,{baseS:t=null,capS:n=null,processing:r=!0,rng:o=Math.random,deadline:s=null}={}){let i=t??(r?F.JY_POLL_MIN_S:F.JY_POLL_MAX_S*.7),a=n??F.JY_POLL_MAX_S,l=Math.min(i,a),u=typeof o=="function"?o:Math.random,d=Math.min(a,l*1.35**Math.min(e,12)),g=Math.min(1,Math.max(0,u())),w=l+g*(d-l);if(s!=null)try{if(typeof s.expired=="function"&&s.expired())throw new Error("deadline exceeded");typeof s.remaining=="number"&&Number.isFinite(s.remaining)&&(w=Math.min(w,Math.max(0,s.remaining)))}catch(h){if(h instanceof Error&&h.message==="deadline exceeded")throw h}return await ct(w*1e3),w}c(In,"fullJitterSleep");import Nn from"node:http";import Tn from"node:https";var Qr=new Set(["ENOENT","EACCES","EISDIR","EPERM","ENOTDIR","ELOOP","ENAMETOOLONG"]),$n=16*1024*1024,Zr=new Set(["ECONNRESET","ECONNREFUSED","ECONNABORTED","EPIPE","EHOSTUNREACH","ENETUNREACH","ENETDOWN","ENOTFOUND","EAI_AGAIN","ETIMEDOUT"]);function Fe(e,t){if(e instanceof tt)return e;let n=e?.code??"";if(n&&Qr.has(n))return e;let r=String(e?.message??e??""),o=/socket hang up|connection closed|aborted/i.test(r);return!t&&Zr.has(n)||o||n==="ABORT_ERR"?new tt((n||"network")+": "+r,{detail:n,connectPhase:!t,cause:e}):new tt((n||"network")+": "+r,{detail:n,cause:e})}c(Fe,"classifyNetworkError");function to(e,t){let n=e.headers;return{status:e.statusCode,ok:e.statusCode>=200&&e.statusCode<400,headers:n,header(r){let o=n[r.toLowerCase()];return Array.isArray(o)?o[0]:o},text(){return t.toString("utf8")},json(){return JSON.parse(t.toString("utf8"))},body:t}}c(to,"makeResponse");var ie=class{static{c(this,"Session")}#t;#e;_lastUse=0;_inflight=0;constructor(t=F.POOL_SIZE){let n={keepAlive:!0,keepAliveMsecs:3e4,maxSockets:t,maxFreeSockets:t,scheduling:"lifo"};this.#t=new Tn.Agent(n),this.#e=new Nn.Agent(n),this._lastUse=Date.now()}async request(t,n,r={}){let{headers:o={},body:s=null,contentLength:i=null,timeout:a=null,followRedirects:l=!0,retry:u=eo}=r,d=u.total,g=u.connect,w=u.status,h=4,p=n,S=t.toUpperCase(),N=s===void 0?null:s,k=o,x=r.signal??null,E=r.token??null,m=r.maxBody??$n;if(x?.aborted)throw new et("request aborted before start");this._inflight=(this._inflight|0)+1;try{for(;;){try{E?.check?.()}catch(O){throw O}if(x?.aborted)throw new et("request aborted");let y;try{this._lastUse=Date.now(),y=await this.#n(S,p,k,N,a,i,m,x,E)}catch(O){if(x?.aborted||E?.cancelled===!0)throw new et("request aborted",{cause:O});if(O instanceof et)throw O;let C=O instanceof tt?O:Fe(O,!1);if((C instanceof Pt||C.connectPhase&&!(C instanceof Ot))&&g>0&&d>0){g-=1,d-=1,await ct(u.backoffFactor*1e3*2**(u.total-d-1));continue}throw C}if(l&&[301,302,303,307,308].includes(y.status)){let O=y.header("location");if(O){if(h<=0)throw new tt("too many redirects (limit 4) at "+p,{detail:O});h-=1;let C;try{C=new URL(O,p).toString()}catch(I){throw new tt("bad redirect location: "+String(O).slice(0,200),{detail:O,cause:I})}try{new URL(C).origin!==new URL(p).origin&&(k=Object.fromEntries(Object.entries(k).filter(([I])=>!["authorization","cookie","proxy-authorization"].includes(I.toLowerCase()))))}catch{}p=C,(y.status===303||(y.status===301||y.status===302)&&S==="POST")&&(S="GET",N=null,k=Object.fromEntries(Object.entries(k).filter(([I])=>!["content-length","content-type","transfer-encoding"].includes(I.toLowerCase()))));continue}}if(w>0&&d>0&&u.statusForcelist.includes(y.status)){w-=1,d-=1,await ct(u.backoffFactor*1e3*2**(u.total-d-1));continue}return y}}finally{this._inflight=(this._inflight|0)-1}}#n(t,n,r,o,s,i,a=null,l=null,u=null){let d=a??$n;return new Promise((g,w)=>{let h=new URL(n),p=h.protocol==="https:",S=p?Tn:Nn,N={protocol:h.protocol,hostname:h.hostname,port:h.port||void 0,path:`${h.pathname}${h.search}`,method:t,headers:r,agent:p?this.#t:this.#e},k=!1,x=!1,E=null,m=c(()=>{E!==null&&(clearTimeout(E),E=null)},"clearConnectTimer"),y=c(()=>{},"detachAbort"),O=c(()=>{},"detachToken"),C=c(A=>{if(!k){k=!0,m();try{y()}catch{}try{O()}catch{}try{T()}catch{}if(l?.aborted||u?.cancelled===!0||A instanceof et){w(A instanceof et?A:new et("request aborted",{cause:A}));return}w(Fe(A,x))}},"fail"),I=S.request(N,A=>{x=!0,m();let M=[],b=0;A.on("data",_=>{if(b+=_.length,b>d){C(new tt("response body exceeds cap ("+d+" bytes)",{detail:d}));try{A.destroy()}catch{}return}M.push(_)}),A.on("end",()=>{if(!k){k=!0;try{y()}catch{}try{O()}catch{}try{T()}catch{}g(to(A,Buffer.concat(M)))}}),A.on("error",C),A.on("close",()=>{!k&&!A.complete&&C(new tt("response closed without end",{detail:"res-close"}))})});if(l)if(l.aborted)C(new et("request aborted"));else{let A=c(()=>{try{I.destroy(new Error("aborted"))}catch{}},"onAbort");y=c(()=>{try{l.removeEventListener("abort",A)}catch{}},"detachAbort");try{l.addEventListener("abort",A,{once:!0})}catch{}}u&&typeof u.onCancel=="function"&&(u.cancelled===!0?C(new et("request aborted")):O=u.onCancel(()=>{try{I.destroy(new et("request aborted"))}catch{}})),I.on("error",C),I.on("close",()=>{m();try{T()}catch{}k||C(new tt("socket closed without response",{detail:"req-close",connectPhase:!x}))});try{I.setNoDelay(!0)}catch{}let $=null;if(s!=null){let[A,M]=s;if(A!=null&&(E=setTimeout(()=>{I.destroy(new Pt(`connect timeout ${A}s`))},A*1e3)),M!=null){let b=c(_=>{try{_.setNoDelay(!0)}catch{}let B=c(()=>{I.destroy(new Ot(`read timeout ${M}s`))},"onTimeout");try{_.setTimeout(M*1e3,B)}catch{}$=c(()=>{try{_.removeListener("timeout",B)}catch{}try{_.setTimeout(0)}catch{}},"socketCleanup")},"onSocket");I.on("socket",b)}}let T=c(()=>{if($){let A=$;$=null;try{A()}catch{}}},"cleanupSocket");if(o!=null){let A=Object.keys(r??{}).map(M=>M.toLowerCase());if(typeof o=="function"){!A.includes("content-length")&&i!=null&&I.setHeader("Content-Length",i);let M=o(),b=c(()=>{try{M&&!M.destroyed&&M.destroy()}catch{}},"destroyStream");I.on("close",b),I.on("error",b),M.on("error",_=>{I.destroy(Fe(_,x))}),M.on("data",_=>{if(!(I.destroyed||I.writableEnded)&&!I.write(_)){try{M.pause()}catch{}I.once("drain",()=>{try{M.resume()}catch{}})}}),M.on("end",()=>{try{I.end()}catch{}})}else{let M=Buffer.isBuffer(o)?o:Buffer.from(String(o),"utf8");A.includes("content-length")||I.setHeader("Content-Length",M.length),I.write(M),I.end()}}else I.end()})}get(t,n={}){return this.request("GET",t,n)}post(t,n={}){return this.request("POST",t,n)}put(t,n={}){return this.request("PUT",t,n)}close(){this.#t.destroy(),this.#e.destroy()}closeIdle(){try{this.#t.closeIdleConnections?.()}catch{}try{this.#e.closeIdleConnections?.()}catch{}}},eo=Object.freeze({total:2,connect:2,read:0,status:1,backoffFactor:.2,statusForcelist:[429,500,502,503,504]}),ft=null,no=25e3;function Cn(e=null){return new ie(e??F.POOL_SIZE)}c(Cn,"buildSession");function Rn(){if(ft===null)return ft=Cn(),ft;try{if(ft instanceof ie&&Date.now()-(ft._lastUse||0)>no){if((ft._inflight|0)>0){try{ft.closeIdle()}catch{}return ft}try{ft.close()}catch{}ft=Cn()}}catch{}return ft}c(Rn,"getSession");import Pn from"node:crypto";import ro from"node:os";function oo(){let e=ro.networkInterfaces();for(let n of Object.values(e))for(let r of n??[])if(r.mac&&r.mac!=="00:00:00:00:00:00"&&!r.internal)return Number.parseInt(r.mac.replace(/:/g,""),16);let t=Pn.randomBytes(6);return t[0]|=1,Number.parseInt(t.toString("hex"),16)}c(oo,"firstMacDecimal");var ae=null;function On(){if(ae)return ae;let e=new Date().getFullYear()%10,t;return e%2?t="3278516897751":t=String(oo()).padStart(13,"0"),ae=`${390+e}${t}`,ae}c(On,"tdid");function ce(e,t,n=null){if(!t||!String(t).trim())throw new TypeError("jyHeaders: deviceId must be non-empty");let r=String(n??F.JY_APPVR).trim();if(!r)throw new TypeError("jyHeaders: appVersion must be non-empty");let o=String(Math.floor(Date.now()/1e3)),s=e.length>=7?e.slice(-7):e,i=Pn.createHash("md5").update(`9e2c|${s}|4|${r}|${o}|${t}|11ac`,"utf8").digest("hex");return{"User-Agent":F.JY_SIGN_UA,appvr:r,"device-time":o,pf:"4",sign:i,"sign-ver":"1",tdid:t,"Content-Type":"application/json"}}c(ce,"jyHeaders");function le(e){if(e==null)throw new TypeError("timestamp thiếu (null/undefined): "+JSON.stringify(e));if(e==="")throw new TypeError("timestamp không hợp lệ: "+JSON.stringify(e));let t=Number(e);if(!Number.isFinite(t))throw new TypeError("timestamp không hợp lệ: "+JSON.stringify(e));return Math.trunc(t)}c(le,"toMs");function Ln(e){if(typeof e!="string")throw new TypeError("text phải là string, got: "+JSON.stringify(e)?.slice(0,120));return e}c(Ln,"toText");function Fn(e,t,n){if(e<0||t<0)throw new RangeError(n+": timestamp < 0 (start="+e+", end="+t+")");if(t<e)throw new RangeError(n+": end < start (start="+e+", end="+t+")")}c(Fn,"checkRange");function so(e){if(!Array.isArray(e))return null;let t=[];for(let n=0;n<e.length;n++){let r=e[n];if(r==null||typeof r!="object")throw new TypeError("word["+n+"] null/invalid");let o;try{o=Ln(r.text)}catch(a){throw new TypeError("word["+n+"] text invalid: "+a.message,{cause:a})}if(!o.trim())continue;let s,i;try{s=le(r.start_time),i=le(r.end_time)}catch(a){throw new TypeError("word["+n+"] timestamp invalid: "+a.message,{cause:a})}Fn(s,i,"word["+n+"]"),t.push({startMs:s,endMs:i,text:o})}return t.length>0?t:null}c(so,"toWords");function Bn(e){let t=e?.utterances;if(!Array.isArray(t))throw new TypeError("JianYing query thiếu utterances");return t.map((n,r)=>{try{if(n==null||typeof n!="object")throw new TypeError("utterance["+r+"] null/invalid");let o=le(n.start_time),s=le(n.end_time),i=Ln(n.text);return Fn(o,s,"utterance["+r+"]"),{startMs:o,endMs:s,text:i,words:so(n.words)}}catch(o){if(o instanceof TypeError||o instanceof RangeError){if(o._jyIdx===r)throw o;let s=o instanceof RangeError?RangeError:TypeError,i=new s("utterance["+r+"] invalid: "+o.message,{cause:o});throw i._jyIdx=r,i}throw o}})}c(Bn,"parseJianyingUtterances");var zn=new Set([429,500,502,503,504]);function ue(e,t){if(e.status>=400){let r=e.text();throw new X(`HTTP ${e.status}: ${r.slice(0,500)}`,{provider:"JianYing",phase:t,detail:r.slice(0,500),retryable:zn.has(e.status)})}let n;try{n=e.json()}catch(r){let o="";try{o=String(e.text()).slice(0,120)}catch{}let s=/^\s*<(?:!doctype|html)/i.test(o);throw new X("phản hồi không phải JSON ("+t+"): "+o,{provider:"JianYing",phase:t,detail:o.slice(0,500),retryable:!s,cause:r})}return n}c(ue,"ensureJson");async function Un(e,t,{headers:n,timeout:r,label:o,jsonBody:s=null,data:i=null,token:a=null}){let l=s!==null?JSON.stringify(s):i,u=a?{headers:n,timeout:r,body:l,token:a}:{headers:n,timeout:r,body:l},d=await e.request("POST",t,u);return ue(d,o)}c(Un,"postJson");async function Jn(e,t,n,{appVersion:r=null,session:o=null,sleepFn:s=In,token:i=null,crcHex:a=null,audioSize:l=null}={}){let u=String(e),g=Number.isInteger(l)&&l>0?l:jn.statSync(u).size,w=a??cn(u),h=c(()=>jn.createReadStream(u,{highWaterMark:F.UPLOAD_HWM_BYTES}),"openAudio"),p=o??Rn(),S=On(),N=r??F.JY_APPVR,k=F.JY_BASE,x=F.jyTimeout("long"),E=F.jyTimeout("poll"),m=F.jyTimeout("upload"),y=c(()=>i?.check(),"checkpoint"),O;if(await G.time("jy_upload_sign_ms",async()=>{n(20,"JianYing · xin credential…");let L="/lv/v1/upload_sign";for(;;){y();try{O=await Un(p,k+L,{headers:ce(L,S,N),timeout:x,label:"upload_sign",data:JSON.stringify({biz:"pc-recognition"}),token:i});return}catch(U){if(U instanceof X&&U.retryable){n(20,"JianYing · credential server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(U instanceof tt))throw U;n(20,`JianYing · credential mạng lag, thử lại… (${U.name})`),await s(1,{processing:!1})}}}),String(O.ret)!=="0")throw new X(`upload_sign: ${JSON.stringify(O)}`,{provider:"JianYing",phase:"upload_sign",detail:O,retryable:!0});let C=O.data??{},I=C.access_key_id,$=C.secret_access_key,T=C.session_token;if(!I||!$||!T)throw new X("thiếu upload credential",{provider:"JianYing",phase:"upload_sign"});let A;await G.time("jy_apply_upload_ms",async()=>{let L=_n(g),U=kn(String(I),String($),String(T),L),V="https://vod.bytedanceapi.com/?"+L;for(;;){y();try{A=ue(await p.get(V,i?{headers:U,timeout:x,token:i}:{headers:U,timeout:x}),"upload_auth");return}catch(K){if(K instanceof X&&K.retryable){n(30,"JianYing · auth server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(K instanceof tt))throw K;n(30,"JianYing · auth mạng lag, thử lại…"),await s(1,{processing:!1})}}});let M=A?.Result?.UploadAddress??{},b=(M.StoreInfos??[{}])[0]??{},_=b.StoreUri,B=b.Auth,j=b.UploadID,J=(M.UploadHosts??[""])[0];if(!_||!B||!j||!J)throw new X("upload auth thiếu dữ liệu",{provider:"JianYing",phase:"upload_auth"});await G.time("jy_put_ms",async()=>{n(40,"JianYing · upload audio…");let L="https://"+String(J)+"/"+String(_),U={"User-Agent":F.JY_UPLOAD_UA,Authorization:String(B),"Content-CRC32":w},V;for(;;){y();try{V=ue(await p.put(`${L}?partNumber=1&uploadID=${j}`,{headers:U,body:h,contentLength:g,timeout:m,...i?{token:i}:{}}),"upload_put");break}catch(nt){if(nt instanceof X&&nt.retryable){n(40,"JianYing · upload server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(nt instanceof tt))throw nt;n(40,"JianYing · upload lag, thử lại…"),await s(1,{processing:!1})}}if(V.success!==0)throw new X(`upload: ${JSON.stringify(V)}`,{provider:"JianYing",phase:"upload_put",detail:V,retryable:!0});if(!/^[0-9a-fA-F]{8}$/.test(String(w).trim()))throw new X("merge crc không hợp lệ: "+JSON.stringify(w)?.slice(0,60),{provider:"JianYing",phase:"upload_merge",detail:String(w).slice(0,60),retryable:!1});let K="1:"+String(w).trim().toLowerCase(),ot=0;for(y();;){y();try{let nt=await p.post(`${L}?uploadID=${j}`,{headers:U,body:K,timeout:x,...i?{token:i}:{}});if(nt.status>=400){let Ge=nt.text();if(zn.has(nt.status)){n(40,"JianYing · merge server bận, thử lại…"),await s(1,{processing:!1});continue}throw new X(`HTTP ${nt.status}: ${Ge.slice(0,500)}`,{provider:"JianYing",phase:"upload_merge",detail:Ge.slice(0,500),retryable:!1})}let xt=nt.text();if(/^\s*<(?:!doctype|html)/i.test(xt.slice(0,120))){if(ot+=1,ot>=3)throw new X("merge trả về HTML (WAF?), dừng sau 3 lần thử",{provider:"JianYing",phase:"upload_merge",detail:xt.slice(0,200),retryable:!1});n(40,"JianYing · merge HTML lạ, thử lại…"),await s(1,{processing:!1});continue}break}catch(nt){if(nt instanceof X||!(nt instanceof tt))throw nt;n(40,"JianYing · merge lag, thử lại…"),await s(1,{processing:!1})}}});let W;if(await G.time("jy_submit_ms",async()=>{n(58,"JianYing · tạo task…");let L="/lv/v1/audio_subtitle/submit",U={adjust_endtime:F.JY_ADJUST_ENDTIME,audio:_,caption_type:F.JY_CAPTION_TYPE,client_request_id:Dn.randomUUID(),max_lines:1,songs_info:[{end_time:Math.max(1e3,Math.trunc(t)),id:"",start_time:0}],words_per_line:F.JY_WORDS_PER_LINE};for(;;){y(),U.client_request_id=Dn.randomUUID();try{W=await Un(p,k+L,{headers:ce(L,S,N),timeout:x,label:"submit",jsonBody:U,token:i});return}catch(V){if(V instanceof X&&V.retryable){n(58,"JianYing · submit server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(V instanceof tt))throw V;n(58,"JianYing · submit lag, thử lại…"),await s(1,{processing:!1})}}}),String(W.ret)!=="0")throw new X(`submit: ${JSON.stringify(W)}`,{provider:"JianYing",phase:"submit",detail:W,retryable:!0});let Y=String(W?.data?.id??"").trim();if(!Y)throw new X("submit thiếu task id",{provider:"JianYing",phase:"submit"});let H="/lv/v1/audio_subtitle/query",P=F.JY_POLL_MAX_ATTEMPTS,v=0,R=c(async(L,U)=>L<=3?s(L,{...U,baseS:.12,capS:.25}):s(L,U),"paceSleep"),D=await G.time("jy_poll_ms",async()=>{for(let L=0;P<=0||L<P;L++){y();let U;try{let K=await p.post(k+H,{body:JSON.stringify({id:Y,pack_options:{need_attribute:!0}}),headers:ce(H,S,N),timeout:E,...i?{token:i}:{}});U=ue(K,"query")}catch(K){if(K instanceof X&&K.retryable){v+=1,L%3===0&&n(Math.min(91,60+L%200/10|0),"JianYing · server bận, poll tiếp…"),await R(L,{processing:!1});continue}if(K instanceof tt){v+=1,G.incr("jy_poll_network_blips"),L%3===0&&n(Math.min(91,60+L%200/10|0),`JianYing · mạng gián đoạn, poll tiếp… (#${v})`),await R(L,{processing:!0});continue}throw K}if(String(U.ret)!=="0"){G.incr("jy_poll_ret_nonzero"),await R(L,{processing:!1});continue}let V=U.data;if(V!=null){let K;try{K=Bn(V)}catch(ot){throw new X(String(ot?.message??ot),{provider:"JianYing",phase:"query",detail:String(ot?.message??ot).slice(0,500),cause:ot})}return G.incr("jy_success"),n(92,`JianYing · ${K.length} utterances`),K}L%4===0&&n(Math.min(91,60+L%200/10|0),"JianYing · chờ ASR (không timeout)…"),await R(L,{processing:!0})}return null});if(D!==null)return D;throw G.incr("jy_timeout"),new X(`query dừng sau ${P} lần poll (task=${Y})`,{provider:"JianYing",phase:"query",retryable:!0})}c(Jn,"jianying");var Ut=class{static{c(this,"TokenBucket")}#t;#e;#n;#o;constructor(t=null,n=null){let r=t??F.RATE_RPS;if(!Number.isFinite(r)||!(r>0))throw new TypeError("TokenBucket rate must be > 0, got "+JSON.stringify(t));let o=n??Math.max(1,r);if(!Number.isFinite(o)||!(o>0))throw new TypeError("TokenBucket capacity must be > 0, got "+JSON.stringify(n));this.#t=r,this.#e=o,this.#n=this.#e,this.#o=performance.now()}async acquire(t=30,n=1){if(!Number.isFinite(n)||!(n>0))throw new TypeError("TokenBucket acquire cost must be > 0, got "+JSON.stringify(n));if(n>this.#e)throw new RangeError("TokenBucket cost "+n+" exceeds capacity "+this.#e);let r=t===null?null:performance.now()+t*1e3;for(;;){let o=performance.now(),s=(o-this.#o)/1e3;if(this.#o=o,this.#n=Math.min(this.#e,this.#n+s*this.#t),this.#n>=n)return this.#n-=n,!0;let i=(n-this.#n)/this.#t;if(r!==null&&performance.now()+i*1e3>r)return!1;await ct(Math.min(50,Math.max(1,i*1e3)))}}};var st=Object.freeze({MAX_CHARS:42,SOFT_MAX_CHARS:56,MIN_DURATION_S:5/6,MAX_DURATION_S:7,CPS:20,GAP_MS:84,MERGE_GAP_S:1.5}),Gn=/[.!?…。！？]["»”')\]]?$/,io=/[,;:、，；：—]["»”')\]]?$/,Mt=/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/,fe=/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef。！？，、；：“”‘’（）《》【】]/,ao=new Set(["mr","mrs","ms","dr","prof","sr","jr","st","vs","etc","no","fig","approx","dept","est","min","max","inc","ltd","co","corp","vol","ch","sec","tp","ths","ts","pgs","gs","ks","bs","cn","jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec"]);function co(e){let t=0;for(let n=0;n<e.length;n++){let r=e.charCodeAt(n);if(r>=55296&&r<=56319&&n+1<e.length){let o=e.charCodeAt(n+1);o>=56320&&o<=57343&&n++}t++}return t}c(co,"charLen");function Ct(e){let t=0;for(let n=0;n<e.length;n++){let r=e.charCodeAt(n);if(r>=55296&&r<=56319&&n+1<e.length){let o=e.charCodeAt(n+1);o>=56320&&o<=57343&&n++}t+=Mt.test(e[n])?2:1}return t}c(Ct,"visualLen");function Jt(e){return String(e).split(/\s+/).filter(Boolean).join(" ")}c(Jt,"collapse");function zt(e){return Gn.test(e.trim())}c(zt,"endsSentence");function Be(e,t){if(!e)return t;if(!t)return e;let n=e[e.length-1],r=t[0];return fe.test(n)&&fe.test(r)?`${e}${t}`:fe.test(n)||fe.test(r)?/[，。！？、；：“”‘’（）《》【】]/.test(n)||/[，。！？、；：“”‘’（）《》【】]/.test(r)?`${e}${t}`:`${e}${t}`:`${e} ${t}`}c(Be,"concatWordPair");function qn(e){let t=Jt(e),n=[],r=0;for(let s=0;s<t.length;s++){let i=t[s];if(i!=="."&&i!=="!"&&i!=="?"&&i!=="…"&&i!=="。"&&i!=="！"&&i!=="？"||i==="."&&/\d/.test(t[s-1]??"")&&/\d/.test(t[s+1]??"")||i==="."&&Vn(t,s))continue;let a=s+1;for(;a<t.length&&/[.!?…。！？]/.test(t[a]);)a++;for(;a<t.length&&/["»”')\]]/.test(t[a]);)a++;if(i==="。"||i==="！"||i==="？"){n.push(t.slice(r,a).trim()),r=a,s=a-1;continue}(a>=t.length||/\s/.test(t[a]))&&(n.push(t.slice(r,a).trim()),r=a,s=a-1)}let o=t.slice(r).trim();return o&&n.push(o),n.filter(Boolean)}c(qn,"splitSentences");function Vn(e,t){if(e[t+1]===".")return!1;let r=(e.slice(0,t).split(/\s+/).pop()??"").replace(/^["«“'(\[]+/,"");return!!(/(?:^|\s)(?:e\.g\.|i\.e\.|etc\.|v\.v\.|(?:[a-z]\.){2,})$/i.test(e.slice(0,t+1))||/^[A-Za-z]$/.test(r)||ao.has(r.toLowerCase()))}c(Vn,"isAbbreviationDot");function Hn(e,t=""){if(e.length===0)return"";if(t&&!t.includes(" ")&&Mt.test(t))return e.map(n=>n.text).join("");if(Mt.test(t)){let n="";for(let r of e)n=Be(n,r.text);return n}return e.map(n=>n.text).join(" ")}c(Hn,"joinWordTokens");function Wn(e,t,n,r=""){let o=0;for(let i=0;i<n.length;i++){let a=n[i],l=t.slice(o,a+1);e.push({start:l[0].start,end:l[l.length-1].end,text:Hn(l,r),words:l,sentenceFlag:void 0,rawStartMs:null,rawEndMs:null}),o=a+1}let s=t.slice(o);e.push({start:s[0].start,end:s[s.length-1].end,text:Hn(s,r),words:s,sentenceFlag:void 0,rawStartMs:null,rawEndMs:null})}c(Wn,"pushWordSlices");function de(e){return Jt(e).replace(/\s+/g,"")}c(de,"squashWhitespace");function Yn(e,t){let n=e.map(r=>r.text).join("");return n.length>0&&de(n)===de(t)}c(Yn,"wordsCoverText");function lo(e,t){if(!Number.isInteger(t)||t<2)return[];if(!Array.isArray(e)||e.length<t)return[];let n=[],r=0,o=e.some(u=>Mt.test(u.text));for(let u=0;u<e.length;u++)r+=Ct(e[u].text)+(u>0&&!o?1:0),n.push(r);let s=n[n.length-1]??0;if(!(s>0))return[];let i=t-1,a=[],l=-1;for(let u=1;u<=i;u++){let d=s*u/t,g=e.length-1-(i-u),w=null,h=1/0;for(let p=l+1;p<=g;p++){let S=Math.abs(n[p]-d),N=Math.max(0,(e[p+1]?.start??e[p].end)-e[p].end),k=N>.02?Math.min(6,N*12):0,x=S-k;x<h&&(h=x,w=p)}if(w===null||w<=l)return[];a.push(w),l=w}return a}c(lo,"chooseEvenBreaks");function uo(e,t=1){if(!Array.isArray(e))return null;let n=Math.abs(t-1)>1e-9,r=[];for(let o=0;o<e.length;o++){let s=e[o];if(!s)continue;let i=Jt(s.text);!i||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<s.start||r.push({start:n?s.start/t:s.start,end:n?s.end/t:s.end,text:i})}return r.length>0?r:null}c(uo,"toTimelineWords");function fo(e,t=null){if(Array.isArray(t)&&t.length>1){let s=[],i=0,a=!0;for(let l=0;l<t.length;l++){let u=de(t[l]);if(!u)continue;let d=[],g="";for(;i<e.length&&g.length<u.length;){let w=e[i++];d.push(w),g+=de(w.text)}if(d.length===0||g!==u){a=!1;break}s.push({text:t[l],words:d})}if(a&&i===e.length&&s.length===t.length)return s}let n=[],r=[],o="";for(let s of e)r.push(s),o=Be(o,s.text),zt(o)&&qn(o).length>=1&&!Vn(o,o.length-1)&&(n.push({text:o,words:r}),r=[],o="");return r.length>0&&n.push({text:o,words:r}),n}c(fo,"groupWordsIntoSentences");function ho(e,t){let n=[],r=0,o=e.some(d=>Mt.test(d.text));for(let d=0;d<e.length;d++)r+=Ct(e[d].text)+(d>0&&!o?1:0),n.push(r);let s=n[n.length-1]??0,i=[];for(let d=0;d<e.length-1;d++)(Gn.test(e[d].text)||io.test(e[d].text))&&i.push(d);let a=t-1;if(i.length<a)return[];let l=[],u=-1;for(let d=1;d<=a;d++){let g=s*d/t,w=i.length-1-(a-d),h=-1,p=1/0;for(let S=u+1;S<=w;S++){let N=i[S],k=Math.abs(n[N]-g);k<p&&(p=k,h=S)}if(h<0||h<=u)return[];l.push(i[h]),u=h}return l}c(ho,"chooseClauseBreaks");function De(e,t={}){let n=t.softMaxChars??st.SOFT_MAX_CHARS,r=t.minS??st.MIN_DURATION_S,o=t.maxS??st.MAX_DURATION_S,s=t.cps??st.CPS,i=(t.gapMs??st.GAP_MS)/1e3,a=t.mergeGapS??st.MERGE_GAP_S,l=mt(t.speed??pt),u=Math.abs(l-1)>1e-9,d=u?a/l:a;if(!Number.isFinite(r)||!Number.isFinite(o)||r>o)throw new RangeError(`buildCues: require finite minS<=maxS (got minS=${r}, maxS=${o})`);if(!Array.isArray(e))throw new TypeError("buildCues: segments must be an array");let g=[],w=[...e].filter(m=>m&&Jt(m.text)).sort((m,y)=>m.start-y.start||m.end-y.end);for(let m of w){if(!Number.isFinite(m.start)||!Number.isFinite(m.end))throw new RangeError(`buildCues: segment start/end must be finite (got ${m.start}, ${m.end})`);let y=Jt(m.text);if(!y)continue;let O=u?m.start/l:m.start,C=u?m.end/l:m.end,I=uo(m.words,l),$=qn(y),T=m.rawStartMs!=null?u?Math.round(m.rawStartMs/l):m.rawStartMs:null,A=m.rawEndMs!=null?u?Math.round(m.rawEndMs/l):m.rawEndMs:null;if($.length<=1||!I){g.push({start:O,end:C,text:y,words:I,sentenceFlag:zt(y),rawStartMs:T,rawEndMs:A});continue}let M=fo(I,$);if(M.length!==$.length){g.push({start:O,end:C,text:y,words:I,sentenceFlag:zt(y),rawStartMs:T,rawEndMs:A});continue}for(let b of M)g.push({start:b.words[0].start,end:b.words[b.words.length-1].end,text:b.text,words:b.words,sentenceFlag:zt(b.text),rawStartMs:null,rawEndMs:null})}let h=[],p=null;for(let m of g){if(p===null){p={...m,sources:[m]};continue}let y=Mt.test(p.text)||Mt.test(m.text),O=m.start-p.end,C=Ct(p.text)+(y?0:1)+Ct(m.text);!y&&!p.sentenceFlag&&O<=d+1e-9&&O>=-(u?.05/l:.05)&&C<=n*2?(p.text=Be(p.text,m.text),p.end=Math.max(p.end,m.end),p.sentenceFlag=m.sentenceFlag??zt(m.text),p.words=p.words&&m.words?[...p.words,...m.words]:null,p.rawStartMs=p.rawStartMs??m.rawStartMs??null,p.rawEndMs=m.rawEndMs??p.rawEndMs??null,p.sources.push(m)):(h.push(p),p={...m,sources:[m]})}p!==null&&h.push(p);let S=[];for(let m of h){let y=Ct(m.text);if(y<=n){S.push(m);continue}let O=m.text.split(" "),C=Math.ceil(y/n),$=Array.isArray(m.words)&&m.words.length>0&&(m.words.length===O.length||Yn(m.words,m.text)),T=$?ho(m.words,C):[];if(T.length<C-1){if(m.sources&&m.sources.length>1&&m.end-m.start>o){for(let M of m.sources)S.push(M);continue}let A=$&&Yn(m.words,m.text)?lo(m.words,C):[];if(A.length===C-1&&C>1){Wn(S,m.words,A,m.text);continue}S.push(m);continue}Wn(S,m.words,T,m.text)}S.sort((m,y)=>m.start-y.start||m.end-y.end);let N=[],k=-1/0,x=[];for(let m=0;m<S.length;m++){let y=S[m],O=y.start,C=Math.max(y.start,k);C-O>.05&&x.push(`start-shifted:${N.length+1}`);let I=m+1<S.length?S[m+1].start:Number.POSITIVE_INFINITY,$=I<Number.POSITIVE_INFINITY?Math.max(y.end,Math.min(C+r,I-i)):C+r,T=Math.max(y.end,$,C+.001);N.push(St({start:C,end:T,text:y.text,words:y.words??[],rawStartMs:y.rawStartMs??null,rawEndMs:y.rawEndMs??null})),k=T+i}for(let m=0;m<N.length;m++){let y=N[m],O=Ct(y.text)/s,C=m+1<N.length?N[m+1].start-i:Number.POSITIVE_INFINITY,I=Math.min(y.start+O,y.start+o,C);I>y.end&&(N[m]=St({start:y.start,end:I,text:y.text,words:y.words,rawStartMs:y.rawStartMs,rawEndMs:y.rawEndMs}))}let E=N.map((m,y)=>{let O=y+1<N.length?N[y+1].start-i:Number.POSITIVE_INFINITY,C=Math.min(m.end,m.start+o,O),I=Math.min(m.start+Math.min(r,o),O);return St({start:m.start,end:Math.max(C,I,m.start+.001),text:m.text,words:m.words,rawStartMs:m.rawStartMs,rawEndMs:m.rawEndMs})});return{cues:E,warnings:[...x,...po(E,{cps:s,minS:r,gap:i,maxS:o})]}}c(De,"buildCues");function po(e,{cps:t,minS:n,gap:r,maxS:o=null}){let s=[];for(let i=0;i<e.length;i++){let a=e[i],l=a.end-a.start;l<n-1e-9&&s.push(`duration<min: cue ${i+1}`),o!==null&&l>o+1e-9&&s.push(`duration>max: cue ${i+1}`),co(a.text)/l>t&&s.push(`cps>${t}: cue ${i+1}`),i>0&&a.start-e[i-1].end<r-1e-9&&s.push(`gap<${Math.round(r*1e3)}ms: cue ${i+1}`)}return s}c(po,"collectWarnings");function Kn(e){let t=[],n=-1/0;for(let r=0;r<e.length;r++){let o=e[r],s=r+1;o.text.trim()||t.push(`Cue ${s}: rỗng`),o.end<=o.start&&t.push(`Cue ${s}: end <= start`),o.start<n&&t.push(`Cue ${s}: chồng lấn`),o.text.includes(`
`)&&t.push(`Cue ${s}: nhiều dòng`),n=o.end}return t}c(Kn,"validateNetflix");import mo from"node:crypto";import it from"node:fs";import Xn from"node:path";function rt(e,t){it.mkdirSync(Xn.dirname(String(e)),{recursive:!0});let n=`${process.pid}.${Date.now()}.${mo.randomBytes(4).toString("hex")}`,r=`${e}.partial.${n}`,o;try{o=it.openSync(r,"wx")}catch(i){try{it.rmSync(r,{force:!0})}catch{}throw i}try{it.writeFileSync(o,t,"utf8");try{it.fsyncSync(o)}catch{}}catch(i){try{it.closeSync(o)}catch{}try{it.rmSync(r,{force:!0})}catch{}throw i}it.closeSync(o);let s=null;for(let i=0;i<5;i++)try{it.renameSync(r,e),s=null;break}catch(a){if(s=a,i<4&&(a?.code==="EPERM"||a?.code==="EACCES"||a?.code==="EBUSY")){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10*(i+1));continue}break}if(s){try{it.rmSync(r,{force:!0})}catch{}throw s}try{let i=it.openSync(Xn.dirname(String(e)),"r");try{it.fsyncSync(i)}finally{it.closeSync(i)}}catch{}}c(rt,"atomicWriteText");var je=Array.from({length:100},(e,t)=>String(t).padStart(2,"0")),go=Array.from({length:1e3},(e,t)=>String(t).padStart(3,"0"));function Ht(e){if(!Number.isFinite(e))throw new RangeError(`exactMsToSrt: ms must be finite (got ${e})`);let t=Math.max(0,Math.trunc(e)),n=Math.floor(t/36e5);t-=n*36e5;let r=Math.floor(t/6e4);t-=r*6e4;let o=Math.floor(t/1e3);return t-=o*1e3,`${n<100?je[n]:String(n).padStart(2,"0")}:${je[r]}:${je[o]},${go[t]}`}c(Ht,"exactMsToSrt");function Ue(e){if(!Number.isFinite(e))throw new RangeError(`srtTimeFloat: seconds must be finite (got ${e})`);return e<0?Ht(0):Ht(Math.round(e*1e3))}c(Ue,"srtTimeFloat");function Qn(e,t,n=1){if(!Number.isFinite(n)||Math.abs(n-1)<=1e-9)return[e,t];let r=Math.max(0,Math.round(e/n)),o=Math.max(0,Math.round(t/n)),s=t>e?Math.max(r+1,o):Math.max(r,o);return[r,s]}c(Qn,"scaleRangeMs");function Zn(e){return Kn(e)}c(Zn,"validate");function tr(e){let t=Zn(e);if(t.length>0)throw new Wt("SRT không hợp lệ: "+t.slice(0,5).join("; "));return e.map((n,r)=>`${r+1}
${Ue(n.start)} --> ${Ue(n.end)}
${n.text}`).join(`

`)+`
`}c(tr,"renderSrt");function er(e){let t=[];for(let n=0;n<e.length;n++){let r=e[n];t.push(`${n+1}
${Ht(r.startMs)} --> ${Ht(r.endMs)}
${r.text}`)}return t.join(`

`)+`
`}c(er,"rawSrtRows");var wo=/[^\p{L}\p{N}]+/gu,or=.78,bo=8,yo=.92,nr=/[.!?…。！？]["»”')\]]?$/;function ze(e){return String(e).normalize("NFKC").toLowerCase().replace(/ß/g,"ss").replace(/ς/g,"σ").replace(/ẛ/g,"ṡ").replace(wo,"")}c(ze,"normalize");function So(e){let t=new Map;for(let r=0;r<e.length;r++){let o=t.get(e[r]);o?o.push(r):t.set(e[r],[r])}let n=new Set;if(e.length>=200){let r=Math.floor(e.length/100)+1;for(let[o,s]of t)s.length>r&&(n.add(o),t.delete(o))}return{b2j:t,autojunk:n}}c(So,"buildB2J");function xo(e,t,n,r,o,s,i,a){let l=new Map,u=new Map,d=t,g=o,w=0;for(let h=t;h<n;h++){if(a.has(e[h])){l.size>0&&l.clear();continue}let p=i.get(e[h]);if(p!==void 0)for(let N of p){if(N<o)continue;if(N>=s)break;let k=(l.get(N-1)??0)+1;u.set(N,k),k>w&&(d=h-k+1,g=N-k+1,w=k)}let S=l;l=u,u=S,u.size>0&&u.clear()}return[d,g,w]}c(xo,"findLongestMatch");function vo(e,t){let{b2j:n,autojunk:r}=So(t),o=[],s=[[0,e.length,0,t.length]];for(;s.length>0;){let[a,l,u,d]=s.pop(),[g,w,h]=xo(e,a,l,t,u,d,n,r);h>0&&(o.push([g,w,h]),a<g&&u<w&&s.push([a,g,u,w]),g+h<l&&w+h<d&&s.push([g+h,l,w+h,d]))}o.sort((a,l)=>a[0]-l[0]||a[1]-l[1]);let i=[];for(let a of o){let l=i[i.length-1];l&&l[0]+l[2]===a[0]&&l[1]+l[2]===a[1]?l[2]+=a[2]:i.push([...a])}return i}c(vo,"matchingBlocks");function Eo(e,t){return e===t?1:e.length===0||t.length===0?0:2*vo(e,t).reduce((r,[,,o])=>r+o,0)/(e.length+t.length)}c(Eo,"sequenceRatio");function Ao(e,t,n=null,r=null){let o=n??ze(e),s=r??ze(t);return!o||!s?0:o===s?1:2*Math.min(o.length,s.length)/(o.length+s.length)<or?0:o.includes(s)||s.includes(o)?Math.min(o.length,s.length)/Math.max(o.length,s.length):Eo(o,s)}c(Ao,"similarity");function sr(e=null){let t=e??F.OVERLAP_S,n=[],r=new Map,o=c(s=>{let i=r.get(s);return i===void 0&&(i=ze(s),r.set(s,i)),i},"cachedNorm");return{merged:n,pushPart(s){let i=_o(s)?s:[...s].sort((a,l)=>a.start-l.start||a.end-l.end);for(let a of i)ko(n,a,t,o)}}}c(sr,"createIncrementalMerger");var Mo=/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;function rr(e){let t=0;for(let n=0;n<e.length;n++)t+=Mo.test(e[n])?2:1;return t}c(rr,"normInfoLen");function _o(e){for(let t=1;t<e.length;t++){let n=e[t-1],r=e[t];if(r.start<n.start||r.start===n.start&&r.end<n.end)return!1}return!0}c(_o,"isSortedByTime");function ko(e,t,n,r){let o=null,s=0,i=r(t.text),a=rr(i),l=Math.max(0,e.length-20);for(let u=l;u<e.length;u++){let d=e[u];if(Math.abs(t.start-d.start)>n*1.8)continue;let g=r(d.text),h=Math.min(rr(g),a)<bo?yo:or,p=Ao(d.text,t.text,g,i);if(p<h||p<=s)continue;let S=Math.min(d.end,t.end)-Math.max(d.start,t.start),N=Math.abs(t.start-d.start);if(!(S>=0||S>=-1&&N<=1))continue;let x=Math.min(d.start,t.start),m=Math.max(d.end,t.end)-x,y=Math.max(d.end-d.start,t.end-t.start);m>60||m>y+n+1||(o=u,s=p)}if(o!==null){let u=e[o],d=t.text.trim().length,g=u.text.trim().length,w=d>g||d===g&&nr.test(t.text.trim())&&!nr.test(u.text.trim()),h=w?t.text:u.text,p=w?t.words?.length?t.words:u.words??[]:u.words?.length?u.words:t.words??[];e[o]=St({start:Math.min(u.start,t.start),end:Math.max(u.end,t.end),text:h,words:p,rawStartMs:u.rawStartMs??t.rawStartMs??null,rawEndMs:t.rawEndMs??u.rawEndMs??null})}else e.push(t)}c(ko,"mergeSingle");var he=class{static{c(this,"LiveSRTPublisher")}#t;#e;#n;#o=new Map;#i=0;#r=0;#s=null;#a=0;constructor(t,n,{exact:r}){this.#t=t,this.#e=n,this.#n=r,this.published=[]}get warnings(){return this.#i}onChunkDone(t,n){for(this.#o.set(t,n);this.#o.has(this.published.length);){let r=this.published.length;this.published.push(this.#o.get(r)),this.#o.delete(r)}return this.flush()}flush(){let t=mt(this.#e?.speed??pt);if(this.#n){let i=Math.abs(t-1)>1e-9,a=this.published.flat().map(l=>{let u=l.startMs??(Number.isFinite(l.start)?Math.round(l.start*1e3):l.startMs),d=l.endMs??(Number.isFinite(l.end)?Math.round(l.end*1e3):l.endMs),[g,w]=i?Qn(u,d,t):[u,d];return{startMs:g,endMs:w,text:l.text}});return a.length>0&&rt(this.#t,er(a)),a}this.#s||(this.#s=sr());for(let i=this.#a;i<this.published.length;i++)this.#s.pushPart(this.published[i]);this.#a=this.published.length;let n=[...this.#s.merged].sort((i,a)=>i.start-a.start||i.end-a.end),{cues:r,warnings:o}=De(n,{softMaxChars:this.#e.softMaxChars??st.SOFT_MAX_CHARS,maxS:this.#e.maxDuration??st.MAX_DURATION_S,minS:this.#e.minDuration??st.MIN_DURATION_S,cps:this.#e.cps??st.CPS,gapMs:this.#e.gapMs??st.GAP_MS,mergeGapS:this.#e.mergeGapS??st.MERGE_GAP_S,speed:t});this.#i=o.length;let s=o.length-this.#r;return s!==0&&G.incr("netflix_warning",s),this.#r=o.length,r.length>0&&rt(this.#t,tr(r)),r}};var Io=Object.freeze({product:"ASRStudio UltraX (NodeJS)",version:"unknown",input:null,output:null,model:null,language:"auto",chunks:0,cues:0,elapsed_seconds:0,metrics:null});function ir(e={}){return{...Io,...e}}c(ir,"buildRunMetadata");function ar(e,t){rt(e,JSON.stringify(t,null,2))}c(ar,"writeMetadata");function cr(e,t="server",n=[]){let r={provider:t,utterances:n.map(o=>({start_time:o.startMs,end_time:o.endMs,text:o.text}))};rt(e,JSON.stringify(r,null,2))}c(cr,"writeRawUtterances");function lr(e){let t=Math.max(0,Math.floor(e)),n=Math.floor(t/36e5),r=Math.floor(t%36e5/6e4),o=Math.floor(t%6e4/1e3),s=t%1e3;return`${String(n).padStart(2,"0")}:${String(r).padStart(2,"0")}:${String(o).padStart(2,"0")}.${String(s).padStart(3,"0")}`}c(lr,"msToVtt");function ur(e){let t=`WEBVTT

`,n=e.map((r,o)=>{let s=r.startMs!=null?r.startMs:r.rawStartMs!=null?r.rawStartMs:Math.round(r.start*1e3),i=r.endMs!=null?r.endMs:r.rawEndMs!=null?r.rawEndMs:Math.round(r.end*1e3);return`${o+1}
${lr(s)} --> ${lr(i)}
${r.text}`}).join(`

`);return t+n+`
`}c(ur,"renderVtt");function No(e){let t=Math.max(0,Math.floor(e)),n=Math.floor(t/6e4),r=Math.floor(t%6e4/1e3),o=Math.floor(t%1e3/10);return`[${String(n).padStart(2,"0")}:${String(r).padStart(2,"0")}.${String(o).padStart(2,"0")}]`}c(No,"msToLrc");function fr(e){return e.map(t=>{let n=t.startMs!=null?t.startMs:t.rawStartMs!=null?t.rawStartMs:Math.round(t.start*1e3);return`${No(n)}${t.text}`}).join(`
`)+`
`}c(fr,"renderLrc");function dr(e){return e.map(t=>String(t.text||"").trim()).filter(Boolean).join(`
`)+`
`}c(dr,"renderTxt");var _t="AUTO TURBO · JianYing",wt="JianYing ORIGINAL 1:1 · client 10.9",hr=Object.freeze([_t,wt]);function pr(e){if(e===wt||e===_t)return"JianYing";throw new at(`Model không hợp lệ: ${e}`)}c(pr,"resolveProvider");function mr(e){if(e===wt||e===_t)return{model:e,provider:"JianYing"};throw new at(`Model không hợp lệ: ${e} · hợp lệ: ${hr.join(" | ")}`)}c(mr,"resolveEngine");async function*gr(e,t,{maxWorkers:n,token:r=null}={}){if(!Number.isFinite(n)||n<1)throw new TypeError(`maxWorkers phải là số hữu hạn >= 1, nhận: ${n}`);let o=[...t];if(o.length===0)return;let s=Math.max(1,Math.min(Math.trunc(n),o.length)),i=[],a=c(()=>{},"wake"),l=0,u=0,d=!1,g=c(()=>{if(d||l>=o.length||u>=s)return;let h=o[l++];u+=1,Promise.resolve().then(()=>e(h)).then(p=>{d||(i.push({item:h,result:p}),a())},p=>{if(d)return;let S=p instanceof Error?p:new Error(String(p??"unknown error"));i.push({item:h,error:S}),a()})},"launch");for(let h=0;h<s;h++)g();let w=c(()=>new Promise((h,p)=>{let S=null,N=c(()=>{},"unsub"),k=c(()=>{S!==null&&(clearTimeout(S),S=null);try{N()}catch{}a=c(()=>{},"wake")},"cleanup");a=c(()=>{k(),h()},"done"),r&&typeof r.onCancel=="function"&&(N=r.onCancel(()=>{k();try{r.check(),h()}catch(E){p(E)}})),S=setTimeout(()=>{k();try{r?.check()}catch(E){p(E);return}h()},50)}),"idleWithCancel");try{for(;i.length>0||u>0;){for(;i.length===0&&u>0;)await w(),r?.check();r?.check();let h=i.shift();h&&(u-=1,g(),yield[h.item,"error"in h?h.error:h.result])}}finally{d=!0,i.length=0,a=c(()=>{},"wake")}}c(gr,"mapAsCompleted");var $o="8.4.0",pe=class e{static{c(this,"CloudPipeline")}#t;#e;#n=new Map;#o=new Map;#i=0;#r=0;#s=new jt("jianying");#a=new Ut;static ASR_BASE=26;static ASR_SPAN=68;static weightedAverage(t,n){let r=0,o=0;for(let[s,i]of t){let a=n.get(s)??1;r+=a*i,o+=a}return o>0?r/o:0}constructor(t=new Nt,n=()=>{}){this.#t=t,this.#e=n}#c(t,n,r,o){let s=this.#n.get(t)??0;this.#n.set(t,Math.max(s,r));let i=e.weightedAverage(this.#n,this.#o),a=Math.max(this.#r,Math.min(94,e.ASR_BASE+Math.round(e.ASR_SPAN*i/100)));this.#r=a;let l="";if(this.#i>0&&i>1&&i<100){let u=(performance.now()-this.#i)/1e3,d=Math.min(1,i/100);l=` · ETA ${se(u,d)}`}this.#e(a,`Đoạn ${t+1}/${n} · ${o}${l}`)}async#l(t,n,r,o){let s=c((a,l)=>this.#c(n.index,r,a,`${t} · ${l}`),"callback"),i=c(()=>this.#s.call(async()=>{if(!await this.#a.acquire(60))throw new X("rate limited locally",{provider:"JianYing",phase:"rate",retryable:!0});return Jn(n.path,Math.round((n.end-n.start)*1e3),s,{appVersion:o,token:this.#t,crcHex:n.crcHex,audioSize:n.bytes})}),"attemptCall");try{return await i()}catch(a){if(a instanceof yt)return this.#t.check(),await ct(F.CIRCUIT_RESET_S*1e3),this.#t.check(),await i();if(wr(a)){let l=a;for(let u=1;u<=3;u++){this.#t.check(),await ct(Math.min(5e3,500*2**u)),this.#t.check();try{return await i()}catch(d){if(l=d,!wr(d))throw d}}throw l}throw a}}async#u(t,n,r,o,s=null){this.#t.check();let i=s??pr(r),a;try{a=await G.time(`recognize_${i.toLowerCase()}_ms`,()=>this.#l(i,t,n,o))}catch(u){throw Yt(u)?u:(G.incr("provider_errors"),G.incr("chunks_fail"),new at(`Đoạn ${t.index+1} thất bại · ${i}: ${u instanceof f?u.describe():String(u?.message??u)}`,{cause:u}))}if(r===wt){if(a.length===0)throw G.incr("chunks_fail"),new at(`Đoạn ${t.index+1} thất bại · ${i}: kết quả rỗng`);return G.incr("chunks_ok"),[t.index,a,i]}let l=a.filter(u=>{let d=u.text.trim()&&u.endMs>u.startMs;return d||G.incr("rows_dropped"),d}).map(u=>St({start:t.start+u.startMs/1e3,end:t.start+u.endMs/1e3,text:u.text.trim(),words:Ro(u.words,t.start)}));if(l.length===0)throw G.incr("chunks_fail"),new at(`Đoạn ${t.index+1} thất bại · ${i}: kết quả rỗng`);return G.incr("chunks_ok"),[t.index,l,i]}async run(t){let n=G.snapshot(),r=performance.now()/1e3,o=t.inputPath,s=t.outputPath;if(!kt.existsSync(o)||!kt.statSync(o).isFile())throw new at(`Không tìm thấy file: ${o}`);let{model:i,provider:a}=mr(t.model),l=t.jianyingAppVersion||F.JY_APPVR,u=kt.mkdtempSync(Je.join(To.tmpdir(),"asr-ultrax-")),d=Bt(o),g=d.durationS,w=!1,h=t.speed??1,p=Math.abs(h-.8)<1e-4,S=t.physicalSpeed===!0||p&&t.physicalSpeed!==!1;if(Math.abs(h-1)>1e-6&&S&&gn())try{let A=h.toFixed(2).replace(/\.?0+$/,""),M=Je.join(u,`converted-${A}x.mp3`);if(this.#e(4,`Chuyển đổi âm thanh chuẩn ${A}x (không mô phỏng) bằng FFmpeg…`),await wn(o,M,h,{token:this.#t}),kt.existsSync(M)&&kt.statSync(M).size>0&&(d=Bt(M),g=d.durationS,w=!0,this.#e(7,`Đã chuyển đổi âm thanh ${A}x thành công · request ASR trực tiếp…`),!t.srtOnly&&!t.noJunk))try{let b=Rt(s,`_${A}x.mp3`);kt.copyFileSync(M,b)}catch{}}catch(A){if(t.physicalSpeed===!0)throw A}this.#n=new Map,this.#o=new Map,this.#r=0,this.#i=performance.now(),this.#s=new jt("jianying"),this.#a=new Ut;let N=i===wt,k=w?{...t,speed:1}:t,x=new he(s,k,{exact:N}),E=new Map,m=1,y=[];try{let A=new oe(this.#t,this.#e),M=N?await A.singleOriginal(d,u):await A.split(d,u),b=M.length;m=Math.min(F.maxWorkers(t.maxWorkers),b);let _=0;for(let W of M){let Y=Math.max(.001,W.end-W.start);this.#o.set(W.index,Y),_+=Y}let B=0;this.#e(e.ASR_BASE,`UltraX ${m} luồng · ${b} đoạn · ${i}…`);let j=c(W=>this.#u(W,b,i,l,a),"job");for await(let[W,Y]of gr(j,M,{maxWorkers:m,token:this.#t})){if(this.#t.check(),Y instanceof Error){try{this.#t.cancel()}catch{}throw Y}if(!Array.isArray(Y)){try{this.#t.cancel()}catch{}throw new at(`Đoạn ${W.index+1} thất bại · ${a}: kết quả không hợp lệ (${typeof Y})`,{cause:Y instanceof Error?Y:void 0})}let[H,P,v]=Y;E.set(H,v);let R=x.onChunkDone(H,P);B+=this.#o.get(H)??1;let D=_>0?B/_:0,L=e.ASR_BASE+Math.round(e.ASR_SPAN*D),U=Math.min(94,Math.max(this.#r,L));this.#r=U,this.#e(U,`Live SRT · ${x.published.length}/${b} đoạn · ${R.length} cue · ${v}`)}let J=x.flush();if(J.length===0)throw new at("ASR hoàn tất nhưng không trả phụ đề.");y=J}finally{await ct(0);for(let A=0;;A++)try{kt.rmSync(u,{recursive:!0,force:!0,maxRetries:3,retryDelay:100});break}catch(M){let b=M?.code;if((b==="EBUSY"||b==="EPERM"||b==="ENOTEMPTY")&&A<8){await ct(120);continue}break}}let O=performance.now()/1e3-r,C=[...E.keys()].sort((A,M)=>A-M).map(A=>E.get(A)),I=ir({product:"ASRStudio UltraX (NodeJS)",version:$o,input:String(o),output:String(s),model:i,jianying_app_version:l,providers_by_chunk:C,duration_seconds:g,speed:h,scaled_duration_seconds:w?g:Math.round(g/h*1e3)/1e3,audio_physically_converted:w,simulated_subtitles:!w&&Math.abs(h-1)>1e-6,audio_speed:h,chunk_seconds:F.CHUNK_CORE_S,overlap_seconds:F.OVERLAP_S,audio_kind:d.kind,audio_codec:d.track.codec??null,audio_passthrough:!0,chunks:x.published.length,parallel_workers:m,cues:y.length,elapsed_seconds:Math.round(O*1e3)/1e3,live_atomic_srt:!0,jianying_first:!0,no_fallback:!0,netflix_single_line:!0,netflix_max_chars:t.maxChars??42,netflix_cps:t.cps??20,netflix_warnings:x.warnings,metrics:G.snapshotDelta(n),fidelity_note:"Server text/timestamps preserved in ORIGINAL modes. Unofficial cloud ASR cannot mathematically guarantee 99.99% WER; UltraX maximizes fidelity and eliminates client-side corruption."});if(!!!(t.srtOnly||t.noJunk)){if(N){let M=E.get(0)??"server";cr(Rt(s,".raw.json"),M,y)}ar(Rt(s,".json"),I);let A=t.formats||["srt"];(A.includes("vtt")||A.includes("all"))&&rt(Rt(s,".vtt"),ur(y)),(A.includes("lrc")||A.includes("all"))&&rt(Rt(s,".lrc"),fr(y)),(A.includes("txt")||A.includes("all"))&&rt(Rt(s,".txt"),dr(y))}let T=h!==1?` (${h}x)`:"";return this.#e(100,N?`Hoàn tất · giữ nguyên timestamp server${T}`:`Hoàn tất · timeline đã kiểm tra${T}`),on({outputPath:s,segments:y,language:t.language||"auto",languageProbability:0,elapsed:O,speed:h})}};function Rt(e,t){let n=Je.extname(e);return n?e.slice(0,-n.length)+t:e+t}c(Rt,"replaceSuffix");function wr(e){return e instanceof X&&e.retryable&&e.phase==="rate"}c(wr,"isLocalRateLimit");function Co(e){return Array.isArray(e)?e.map(t=>Ee({start:t.startMs/1e3,end:t.endMs/1e3,text:t.text})):null}c(Co,"toWordTimeline");function Ro(e,t){let n=Co(e);return n?n.map(r=>Ee({start:r.start+t,end:r.end+t,text:r.text})):null}c(Ro,"toShiftedWordTimeline");var bt=Number.parseInt(process.env.ASR_GUI_PORT??"8760",10);if(!Number.isInteger(bt)||bt<=0||bt>65535)throw new f(`ASR_GUI_PORT không hợp lệ: ${process.env.ASR_GUI_PORT}`);var we=(process.env.ASR_GUI_HOST??"127.0.0.1").trim()||"127.0.0.1",Ye=/\.(wav|mp3|m4a|flac|ogg|aac|opus|mp4|mkv|mov|avi|webm|wmv|ts|m4v)$/i,Lo=/\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i,Fo=Object.freeze({".mp4":"video/mp4",".m4v":"video/mp4",".webm":"video/webm",".mov":"video/quicktime",".mkv":"video/x-matroska",".avi":"video/x-msvideo",".wmv":"video/x-ms-wmv",".ts":"video/mp2t",".mp3":"audio/mpeg",".m4a":"audio/mp4",".aac":"audio/aac",".wav":"audio/wav",".flac":"audio/flac",".ogg":"audio/ogg",".opus":"audio/ogg"}),z={running:!1,activeJobs:new Map,token:null,startedAtMs:0,lastProgress:0,cueCount:0,lastOutput:"",lastBrowsedDir:process.cwd(),uploadTempDir:null,clients:new Set},Bo=100,br=1<<20,Do=15e3;function jo(){return(!z.uploadTempDir||!Z.existsSync(z.uploadTempDir))&&(z.uploadTempDir=Z.mkdtempSync(q.join(We.tmpdir(),"asr-gui-stage-"))),z.uploadTempDir}c(jo,"ensureUploadTempDir");function Uo(){if(z.uploadTempDir){try{Z.rmSync(z.uploadTempDir,{recursive:!0,force:!0})}catch{}z.uploadTempDir=null}}c(Uo,"cleanupUploadTempDir");process.once("exit",Uo);function ge(e,t){let n=`event: ${e}
data: ${JSON.stringify(t)}

`;for(let r of z.clients)try{if(r.destroyed||r.writableLength>1e6){try{r.destroy()}catch{}z.clients.delete(r);continue}r.write(n)||r.once("drain",()=>{})}catch{try{r.destroy()}catch{}z.clients.delete(r)}}c(ge,"broadcast");function zo(){for(let e of z.clients)try{if(e.destroyed||e.writableLength>1e6){try{e.destroy()}catch{}z.clients.delete(e);continue}e.write(`: ping

`)}catch{try{e.destroy()}catch{}z.clients.delete(e)}}c(zo,"heartbeatTick");var Jo=`<option value="${wt}" selected>JianYing ORIGINAL 1:1 · Real Dữ Liệu Gốc 100.00% (Zero-Touch)</option>`,Ho=`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ASR Studio UltraX Pro · Electron Parallel Workstation</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #000000;
    --panel: #0d0d0d;
    --panel-alt: #141414;
    --border: #242424;
    --border-focus: #ffffff;
    --text: #ffffff;
    --text-sec: #cccccc;
    --muted: #777777;
    --accent: #ffffff;
    --accent-hover: #e0e0e0;
  }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }
  #shell {
    width: min(1360px, 98vw);
    padding: 14px 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .electron-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .win-controls {
    display: flex;
    gap: 7px;
    align-items: center;
  }
  .win-controls .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2a2a2a;
    border: 1px solid #3d3d3d;
  }
  .app-title {
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 1.2px;
    color: #ffffff;
  }
  .title-badges { display: flex; gap: 8px; align-items: center; }
  .badge-mono {
    color: #ffffff;
    background: #141414;
    border: 1px solid #383838;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    white-space: nowrap;
    font-family: Consolas, monospace;
  }
  .workstation-grid {
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 12px;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .workstation-grid { grid-template-columns: 1fr; }
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .section-title {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
  .row { display: flex; gap: 8px; align-items: center; }
  .row-wrap { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  select, input[type=text], input[type=number] {
    color: var(--text);
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    height: 36px;
  }
  select:focus-visible, input:focus-visible, button:focus-visible {
    outline: 1.5px solid var(--border-focus);
    outline-offset: 1px;
  }
  button {
    color: var(--text);
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0 14px;
    height: 36px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: background .1s, border-color .1s, color .1s;
  }
  button:hover:not(:disabled) { border-color: #ffffff; background: #222222; }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary {
    background: #ffffff;
    color: #000000;
    border-color: #ffffff;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .btn-primary:hover:not(:disabled) { background: #e0e0e0; border-color: #e0e0e0; color: #000000; }
  .btn-sm { height: 28px; padding: 0 10px; font-size: 11.5px; border-radius: 4px; }
  .btn-preset {
    background: #141414;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .btn-preset:hover:not(:disabled) { color: #ffffff; border-color: #666666; }
  .btn-preset.active {
    background: #ffffff;
    border-color: #ffffff;
    color: #000000;
    font-weight: 800;
  }
  #dropZone {
    background: var(--panel-alt);
    border: 1.5px dashed #333333;
    border-radius: 6px;
    padding: 16px 14px;
    text-align: center;
    cursor: pointer;
    transition: border-color .15s, background .15s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  #dropZone:hover, #dropZone.dragover {
    border-color: #ffffff;
    background: #1a1a1a;
  }
  #dropTitle { font-size: 13px; font-weight: 700; word-break: break-all; color: #ffffff; }
  .muted { color: var(--muted); font-size: 12px; }
  #previewBox {
    background: #000000;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    position: relative;
  }
  #videoPlayer { width: 100%; max-height: 220px; display: none; background: #000000; }
  #audioPlayer { width: 92%; margin: 18px auto; display: none; }
  #previewEmpty { color: var(--muted); font-size: 11.5px; padding: 18px; text-align: center; }
  .speed-box {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .speed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .speed-badge {
    font-family: Consolas, monospace;
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
    background: #000000;
    border: 1px solid #444444;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .custom-slider {
    --control-value: 50%;
    --track-height: 5px;
    --thumb-size: 16px;
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: var(--thumb-size);
    background: transparent;
    cursor: pointer;
    margin: 0;
  }
  .custom-slider:focus-visible { outline: 1.5px solid #ffffff; outline-offset: 4px; border-radius: 4px; }
  .custom-slider::-webkit-slider-runnable-track {
    height: var(--track-height);
    border-radius: 999px;
    background: linear-gradient(to right, #ffffff var(--control-value), #222222 var(--control-value));
  }
  .custom-slider::-moz-range-track {
    height: var(--track-height);
    border-radius: 999px;
    background: linear-gradient(to right, #ffffff var(--control-value), #222222 var(--control-value));
  }
  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #000000;
    margin-top: calc((var(--track-height) - var(--thumb-size)) / 2);
    box-shadow: 0 1px 3px rgba(0,0,0,.8);
  }
  .custom-slider::-moz-range-thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #000000;
  }
  /* BATCH QUEUE TABLE */
  .queue-container {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #090909;
    overflow-x: auto;
    max-height: 320px;
    overflow-y: auto;
  }
  .queue-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    text-align: left;
  }
  .queue-table th {
    background: #121212;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .queue-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #1a1a1a;
    vertical-align: middle;
  }
  .queue-table tr:hover { background: #141414; }
  .cell-progress { min-width: 140px; }
  .mini-bar-wrap { background: #1e1e1e; border-radius: 3px; height: 5px; overflow: hidden; margin-bottom: 4px; }
  .mini-bar { background: #ffffff; height: 100%; width: 0%; transition: width .15s ease-out; }
  .status-badge {
    font-family: Consolas, monospace;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #333333;
    white-space: nowrap;
  }
  .status-waiting { color: #888888; background: #111111; }
  .status-running { color: #000000; background: #ffffff; border-color: #ffffff; }
  .status-done { color: #ffffff; background: #1c1c1c; border-color: #555555; }
  .status-error { color: #ffffff; background: #2b0000; border-color: #660000; }
  #barWrap { background: #1a1a1a; border-radius: 4px; height: 6px; overflow: hidden; border: 1px solid #222222; }
  #bar { background: #ffffff; height: 100%; width: 0%; transition: width .18s ease-out; }
  #status { font-size: 12.5px; font-weight: 700; min-height: 18px; color: #ffffff; }
  #log {
    background: #050505;
    border: 1px solid #222222;
    border-radius: 6px;
    padding: 8px 12px;
    font-family: Consolas, Menlo, "Courier New", monospace;
    font-size: 11px;
    height: 110px;
    overflow-y: auto;
    white-space: pre-wrap;
    color: #cccccc;
  }
  #resultBox { display: none; }
  dialog {
    background: var(--panel);
    color: var(--text);
    border: 1px solid #444444;
    border-radius: 8px;
    width: min(760px, 94vw);
    padding: 16px;
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.85); }
  #fsList {
    height: 46vh;
    overflow-y: auto;
    margin: 10px 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #050505;
  }
  .fs-item {
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #1a1a1a;
    font-size: 13px;
  }
  .fs-item:hover { background: #1a1a1a; color: #ffffff; }
  .fs-dir { color: #ffffff; font-weight: 700; }
  .fs-size { color: var(--muted); font-family: Consolas, monospace; font-size: 11px; }
</style>
</head>
<body>
<div id="shell">
  <div class="electron-titlebar">
    <div class="win-controls">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <div class="app-title">ASR STUDIO ULTRAX PRO // PARALLEL WORKSTATION</div>
    <div class="title-badges">
      <span class="badge-mono" id="liveBadge">ORIGINAL 1:1 · ZERO-TOUCH</span>
      <span class="badge-mono" id="queueStatsBadge">QUEUE: 0 | ACTIVE: 0</span>
    </div>
  </div>

  <div class="workstation-grid">
    <!-- CỘT TRÁI: NGUỒN MEDIA & CẤU HÌNH TỐC ĐỘ / LUỒNG -->
    <div class="panel">
      <div class="section-title">1. Nguồn Media & Thêm Hàng Loạt</div>

      <div class="row">
        <input id="pathInput" type="text" placeholder="Dán đường dẫn file hoặc thư mục…" style="flex:1" onkeydown="if(event.key==='Enter')applyPathInput()">
        <button onclick="applyPathInput()">Thêm</button>
        <button onclick="openFs()">Duyệt…</button>
      </div>

      <input id="filePicker" type="file" multiple accept="video/*,audio/*,.mp4,.mkv,.mov,.avi,.webm,.wmv,.ts,.m4v,.mp3,.m4a,.wav,.flac,.ogg,.aac,.opus" style="display:none" onchange="onFilePicked(this.files)">
      <div id="dropZone" onclick="document.getElementById('filePicker').click()">
        <div id="dropTitle">Kéo thả 1 hoặc NHIỀU file media vào đây</div>
        <div class="muted">Hỗ trợ chọn nhiều file MP4, MKV, MOV, MP3, M4A, WAV, FLAC · Tự động xếp hàng đợi</div>
      </div>

      <!-- ĐIỀU KHIỂN TỐC ĐỘ & SỐ LUỒNG SONG SONG -->
      <div class="speed-box">
        <div class="speed-header">
          <div>
            <div class="section-title" style="color:var(--text)">2. Tốc Độ & Luồng Song Song</div>
            <div class="muted">Tốc độ ASR & số file chạy song song</div>
          </div>
          <span class="speed-badge" id="speedReadout">1.00x</span>
        </div>

        <input id="speedSlider" class="custom-slider" type="range" min="0.5" max="1.5" step="0.05" value="1" oninput="setSpeed(this.value)">

        <div class="row-wrap" style="justify-content:space-between">
          <div class="row-wrap">
            <button type="button" class="btn-sm btn-preset" data-speed="0.5" onclick="setSpeed(0.5)">0.5x</button>
            <button type="button" class="btn-sm btn-preset" data-speed="0.75" onclick="setSpeed(0.75)">0.75x</button>
            <button type="button" class="btn-sm btn-preset" data-speed="0.8" onclick="setSpeed(0.8)">0.8x</button>
            <button type="button" class="btn-sm btn-preset active" data-speed="1" onclick="setSpeed(1.0)">1.0x (Gốc)</button>
            <button type="button" class="btn-sm btn-preset" data-speed="1.25" onclick="setSpeed(1.25)">1.25x</button>
            <button type="button" class="btn-sm btn-preset" data-speed="1.5" onclick="setSpeed(1.5)">1.5x</button>
          </div>
          <input id="speedNumber" type="number" min="0.5" max="1.5" step="0.01" value="1.00" style="width:72px;height:28px;padding:3px 6px" onchange="setSpeed(this.value)">
        </div>

        <div class="row" style="margin-top:4px">
          <span class="muted" style="font-size:12px;white-space:nowrap">Luồng song song:</span>
          <select id="concurrency" style="flex:1;height:32px">
            <option value="1">1 file tuần tự</option>
            <option value="2" selected>2 file song song (Đề xuất)</option>
            <option value="3">3 file song song</option>
            <option value="4">4 file song song</option>
            <option value="6">6 file song song</option>
          </select>
        </div>
      </div>

      <!-- XEM TRƯỚC FILE ĐANG CHỌN -->
      <div id="previewBox">
        <video id="videoPlayer" controls preload="metadata"></video>
        <audio id="audioPlayer" controls preload="metadata"></audio>
        <div id="previewEmpty">Xem trước media & nghe thử tốc độ 0.5x–1.5x</div>
      </div>
    </div>

    <!-- CỘT PHẢI: BATCH QUEUE & TIẾN TRÌNH SONG SONG -->
    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <div class="section-title">3. Hàng Đợi Xử Lý Song Song (Batch Queue)</div>
        <select id="model" style="display:none">
          \${MODELS_OPTIONS}
        </select>
        <div class="row">
          <button class="btn-sm" onclick="clearCompleted()">Dọn Đã Xong</button>
          <button class="btn-sm" onclick="clearAllQueue()">Xóa Hết</button>
        </div>
      </div>

      <!-- ACTION BAR -->
      <div class="row" style="gap:8px">
        <button id="start" class="btn-primary" style="flex:2;height:42px;font-size:13.5px" onclick="startBatch()">BẮT ĐẦU CHẠY HÀNG LOẠT (.SRT ONLY)</button>
        <button id="cancel" style="flex:1;height:42px" onclick="cancelBatch()" disabled>HỦY TẤT CẢ</button>
      </div>

      <!-- QUEUE TABLE -->
      <div class="queue-container">
        <table class="queue-table">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Tên File Media</th>
              <th style="width:68px">Tốc Độ</th>
              <th class="cell-progress">Tiến Độ</th>
              <th style="width:96px">Trạng Thái</th>
              <th style="width:130px;text-align:right">Thao Tác</th>
            </tr>
          </thead>
          <tbody id="queueBody">
            <tr>
              <td colspan="6" style="text-align:center;padding:28px 12px;color:var(--muted)">
                Hàng đợi trống. Kéo thả nhiều file media hoặc bấm "Duyệt…" để thêm file.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TỔNG THỂ TIẾN TRÌNH -->
      <div>
        <div class="row" style="justify-content:space-between;margin-bottom:4px">
          <div id="status">Sẵn sàng</div>
          <div class="muted" id="pctReadout" style="font-family:Consolas,monospace">0%</div>
        </div>
        <div id="barWrap"><div id="bar"></div></div>
      </div>

      <!-- NHẬT KÝ TIẾN TRÌNH -->
      <div class="section-title">Nhật Ký Tiến Trình</div>
      <div id="log"></div>

      <!-- HIDDEN RESULT BOX CHO VERIFY-DIST TEST PARITY -->
      <div id="resultBox">
        <div id="resultSummary"></div>
        <div id="resultPath"></div>
      </div>
    </div>
  </div>
</div>

<dialog id="fsDialog">
  <div class="row" style="justify-content:space-between;margin-bottom:8px">
    <strong id="fsPath" style="font-size:13px;word-break:break-all"></strong>
    <button class="btn-sm" onclick="document.getElementById('fsDialog').close()">Đóng</button>
  </div>
  <div class="row-wrap" id="fsRoots" style="margin-bottom:6px"></div>
  <div class="row" style="margin-bottom:6px">
    <button class="btn-sm" onclick="fsUp()">↑ Lên thư mục cha</button>
  </div>
  <div id="fsList"></div>
</dialog>

<script>
let currentSpeed = 1.0;
let mediaDurationS = 0;
let lastProgress = 0;
let lastOutputPath = "";
let isBatchRunning = false;
let activeWorkersCount = 0;

let queue = []; // Array of job objects: { id, path, name, size, speed, status, progress, statusText, cues, elapsed, outputPath, error }

const log = document.getElementById("log");
const bar = document.getElementById("bar");
const statusEl = document.getElementById("status");
const pctReadout = document.getElementById("pctReadout");
const liveBadge = document.getElementById("liveBadge");
const queueStatsBadge = document.getElementById("queueStatsBadge");
const videoPlayer = document.getElementById("videoPlayer");
const audioPlayer = document.getElementById("audioPlayer");
const previewEmpty = document.getElementById("previewEmpty");
const speedSlider = document.getElementById("speedSlider");
const speedNumber = document.getElementById("speedNumber");
const speedReadout = document.getElementById("speedReadout");
const queueBody = document.getElementById("queueBody");

function fmtClock(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "--:--";
  const totalMs = Math.round(sec * 1000);
  const s = Math.floor(totalMs / 1000);
  const ms = Math.floor((totalMs % 1000) / 100);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remS = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(remS) + "." + ms;
}

function fmtBytes(b) {
  if (!Number.isFinite(b) || b <= 0) return "";
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function updateSliderFill(el) {
  const min = parseFloat(el.min) || 0.5;
  const max = parseFloat(el.max) || 1.5;
  const val = parseFloat(el.value) || 1.0;
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  el.style.setProperty("--control-value", pct + "%");
}

function setSpeed(rawVal) {
  let num = parseFloat(rawVal);
  if (!Number.isFinite(num)) num = 1.0;
  num = Math.round(Math.max(0.5, Math.min(1.5, num)) * 100) / 100;
  currentSpeed = num;
  speedSlider.value = String(num);
  speedNumber.value = num.toFixed(2);
  speedReadout.textContent = num.toFixed(2) + "x";
  updateSliderFill(speedSlider);

  document.querySelectorAll(".btn-preset").forEach((btn) => {
    const bVal = parseFloat(btn.getAttribute("data-speed"));
    btn.classList.toggle("active", Math.abs(bVal - num) < 0.005);
  });

  for (const mediaEl of [videoPlayer, audioPlayer]) {
    try {
      mediaEl.preservesPitch = true;
      mediaEl.playbackRate = num;
    } catch {}
  }
}

for (const mediaEl of [videoPlayer, audioPlayer]) {
  mediaEl.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
      mediaDurationS = mediaEl.duration;
    }
    try {
      mediaEl.preservesPitch = true;
      mediaEl.playbackRate = currentSpeed;
    } catch {}
  });
}

function previewFile(fullPath) {
  const isAudio = /\\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i.test(fullPath);
  const srcUrl = "/api/media?path=" + encodeURIComponent(fullPath) + "&t=" + Date.now();
  previewEmpty.style.display = "none";
  if (isAudio) {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.style.display = "none";
    audioPlayer.style.display = "block";
    audioPlayer.src = srcUrl;
  } else {
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.style.display = "none";
    videoPlayer.style.display = "block";
    videoPlayer.src = srcUrl;
  }
  try {
    (isAudio ? audioPlayer : videoPlayer).playbackRate = currentSpeed;
  } catch {}
}

function addQueueItem(fullPath, displayName, size = 0) {
  if (!fullPath) return;
  if (queue.some((j) => j.path === fullPath)) return;
  const name = displayName || fullPath.split(/[\\\\/]/).pop();
  const id = "job-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  queue.push({
    id,
    path: fullPath,
    name,
    size,
    speed: currentSpeed,
    status: "IDLE",
    progress: 0,
    statusText: "Đang chờ",
    cues: 0,
    elapsed: 0,
    outputPath: "",
    error: "",
  });
  renderQueue();
  updateStats();
  if (queue.length === 1) previewFile(fullPath);
}

function removeQueueItem(id) {
  const idx = queue.findIndex((j) => j.id === id);
  if (idx !== -1) {
    if (queue[idx].status === "RUNNING") {
      api("/api/cancel", { jobId: id }).catch(() => {});
    }
    queue.splice(idx, 1);
    renderQueue();
    updateStats();
  }
}

function clearCompleted() {
  queue = queue.filter((j) => j.status !== "DONE");
  renderQueue();
  updateStats();
}

function clearAllQueue() {
  if (isBatchRunning) cancelBatch();
  queue = [];
  renderQueue();
  updateStats();
}

function updateStats() {
  const total = queue.length;
  const running = queue.filter((j) => j.status === "RUNNING").length;
  const done = queue.filter((j) => j.status === "DONE").length;
  queueStatsBadge.textContent = "QUEUE: " + total + " | ACTIVE: " + running + " | DONE: " + done;
  if (total > 0) {
    const totalProgress = queue.reduce((acc, j) => acc + (j.progress || 0), 0) / total;
    bar.style.width = Math.round(totalProgress) + "%";
    pctReadout.textContent = Math.round(totalProgress) + "%";
  } else {
    bar.style.width = "0%";
    pctReadout.textContent = "0%";
  }
}

function renderQueue() {
  if (queue.length === 0) {
    queueBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px 12px;color:var(--muted)">Hàng đợi trống. Kéo thả nhiều file media hoặc bấm "Duyệt…" để thêm file.</td></tr>';
    return;
  }
  let html = "";
  queue.forEach((j, i) => {
    let statusClass = "status-waiting";
    let statusLabel = "CHỜ";
    if (j.status === "RUNNING") { statusClass = "status-running"; statusLabel = "ĐANG CHẠY"; }
    else if (j.status === "DONE") { statusClass = "status-done"; statusLabel = "HOÀN TẤT"; }
    else if (j.status === "ERROR") { statusClass = "status-error"; statusLabel = "LỖI"; }

    let actionBtns = "";
    if (j.status === "DONE" && j.outputPath) {
      actionBtns = '<button class="btn-sm btn-primary" onclick="downloadJobSrt(\\'' + encodeURIComponent(j.outputPath) + '\\')">Tải .SRT</button> ' +
                   '<button class="btn-sm" onclick="copyJobSrt(\\'' + encodeURIComponent(j.outputPath) + '\\')">Copy</button>';
    } else if (j.status === "RUNNING") {
      actionBtns = '<button class="btn-sm" onclick="cancelIndividualJob(\\'' + j.id + '\\')">Hủy</button>';
    } else {
      actionBtns = '<button class="btn-sm" onclick="removeQueueItem(\\'' + j.id + '\\')">Xóa</button>';
    }

    html += '<tr onclick="previewFile(\\'' + encodeURI(j.path) + '\\')">' +
      '<td style="color:var(--muted);font-family:Consolas,monospace">' + (i + 1) + '</td>' +
      '<td><div style="font-weight:700;word-break:break-all">' + escapeHtml(j.name) + '</div>' +
          '<div class="muted" style="font-size:11px">' + fmtBytes(j.size) + '</div></td>' +
      '<td style="font-family:Consolas,monospace">' + j.speed.toFixed(2) + 'x</td>' +
      '<td class="cell-progress">' +
        '<div class="mini-bar-wrap"><div class="mini-bar" style="width:' + (j.progress || 0) + '%"></div></div>' +
        '<div class="muted" style="font-size:11px">' + escapeHtml(j.statusText || "") + ' (' + (j.progress || 0) + '%)</div>' +
      '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
      '<td style="text-align:right">' + actionBtns + '</td>' +
    '</tr>';
  });
  queueBody.innerHTML = html;
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function onFilePicked(files) {
  if (!files || !files.length) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const resolved = await api(
        "/api/resolve-file?name=" + encodeURIComponent(file.name) + "&size=" + encodeURIComponent(file.size),
      );
      if (resolved.found) {
        addQueueItem(resolved.path, file.name, file.size);
      } else {
        appendLog("Đang nạp bộ nhớ đệm: " + file.name + "…");
        const upRes = await fetch("/api/upload?name=" + encodeURIComponent(file.name), {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error || upRes.statusText);
        addQueueItem(upData.path, file.name, file.size);
      }
    } catch (err) {
      appendLog("Lỗi nạp " + file.name + ": " + err.message);
    }
  }
}

async function applyPathInput() {
  const val = document.getElementById("pathInput").value.trim().replace(/^["']|["']$/g, "");
  if (!val) return;
  try {
    const info = await api("/api/probe-file?path=" + encodeURIComponent(val));
    addQueueItem(info.path, info.name, info.size || 0);
    document.getElementById("pathInput").value = "";
  } catch (err) {
    alert(err.message);
  }
}

const dropZone = document.getElementById("dropZone");
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer?.files?.length) {
    onFilePicked(e.dataTransfer.files);
  }
});

function appendLog(msg) {
  const line = document.createElement("div");
  line.textContent = msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

const es = new EventSource("/events");
es.addEventListener("progress", (e) => {
  const d = JSON.parse(e.data);
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.progress = d.value;
      job.status = "RUNNING";
      job.statusText = d.message;
      renderQueue();
      updateStats();
    }
  } else {
    lastProgress = Math.max(lastProgress, d.value);
    bar.style.width = lastProgress + "%";
    pctReadout.textContent = lastProgress + "%";
    statusEl.textContent = d.message;
  }
  appendLog("[" + String(d.value).padStart(3, "0") + "%] " + (d.jobId ? "(" + d.jobId + ") " : "") + d.message);
});

es.addEventListener("done", (e) => {
  const d = JSON.parse(e.data);
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.status = "DONE";
      job.progress = 100;
      job.cues = d.cues;
      job.elapsed = d.elapsed;
      job.outputPath = d.output;
      job.statusText = "Hoàn tất (" + d.cues + " câu trong " + d.elapsed.toFixed(1) + "s)";
      appendLog("[100%] Xuất .SRT: " + d.output);
      renderQueue();
      updateStats();
      activeWorkersCount--;
      pumpBatchWorkers();
    }
  } else {
    bar.style.width = "100%";
    pctReadout.textContent = "100%";
    statusEl.textContent = "Hoàn tất · " + d.cues + " câu · " + d.elapsed.toFixed(1) + "s";
    lastOutputPath = d.output;
    document.getElementById("resultSummary").textContent = "✓ Hoàn tất: " + d.cues + " câu";
    document.getElementById("resultPath").textContent = d.output;
  }
});

es.addEventListener("failed", (e) => {
  const d = JSON.parse(e.data);
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.status = "ERROR";
      job.statusText = "Lỗi";
      job.error = d.error;
      appendLog("[LỖI " + d.jobId + "] " + d.error);
      renderQueue();
      updateStats();
      activeWorkersCount--;
      pumpBatchWorkers();
    }
  } else {
    statusEl.textContent = "Lỗi xử lý";
    appendLog(d.error);
  }
});

es.addEventListener("cancelled", (e) => {
  const d = JSON.parse(e.data || "{}");
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.status = "IDLE";
      job.statusText = "Đã hủy";
      renderQueue();
      updateStats();
      activeWorkersCount--;
      pumpBatchWorkers();
    }
  } else {
    statusEl.textContent = "Đã dừng tiến trình";
  }
});

async function api(pathName, body) {
  const res = await fetch(
    pathName,
    body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined,
  );
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

function startBatch() {
  if (queue.length === 0) {
    const manualPath = document.getElementById("pathInput").value.trim().replace(/^["']|["']$/g, "");
    if (manualPath) {
      applyPathInput().then(() => startBatch());
      return;
    }
    alert("Hãy thêm ít nhất một file media vào hàng đợi.");
    return;
  }
  isBatchRunning = true;
  document.getElementById("start").disabled = true;
  document.getElementById("cancel").disabled = false;
  statusEl.textContent = "Đang xử lý hàng loạt…";
  liveBadge.textContent = "ĐANG CHẠY SONG SONG…";

  const concurrency = parseInt(document.getElementById("concurrency").value, 10) || 2;
  for (let i = 0; i < concurrency; i++) {
    pumpBatchWorkers();
  }
}

async function pumpBatchWorkers() {
  if (!isBatchRunning) return;
  const concurrency = parseInt(document.getElementById("concurrency").value, 10) || 2;
  if (activeWorkersCount >= concurrency) return;

  const nextJob = queue.find((j) => j.status === "IDLE");
  if (!nextJob) {
    if (activeWorkersCount === 0) {
      isBatchRunning = false;
      document.getElementById("start").disabled = false;
      document.getElementById("cancel").disabled = true;
      statusEl.textContent = "Toàn bộ hàng đợi đã hoàn tất!";
      liveBadge.textContent = "ORIGINAL 1:1 · ZERO-TOUCH";
      appendLog("[HOÀN TẤT] Toàn bộ hàng đợi đã xử lý xong!");
    }
    return;
  }

  nextJob.status = "RUNNING";
  nextJob.statusText = "Đang bắt đầu…";
  nextJob.progress = 0;
  activeWorkersCount++;
  renderQueue();
  updateStats();

  try {
    await api("/api/start", {
      jobId: nextJob.id,
      input: nextJob.path,
      speed: nextJob.speed || currentSpeed,
    });
  } catch (err) {
    nextJob.status = "ERROR";
    nextJob.statusText = "Lỗi khởi tạo: " + err.message;
    nextJob.error = err.message;
    appendLog("[LỖI " + nextJob.id + "] " + err.message);
    activeWorkersCount--;
    renderQueue();
    updateStats();
    pumpBatchWorkers();
  }
}

async function cancelIndividualJob(jobId) {
  try { await api("/api/cancel", { jobId }); } catch {}
}

async function cancelBatch() {
  isBatchRunning = false;
  try { await api("/api/cancel", {}); } catch {}
  document.getElementById("start").disabled = false;
  document.getElementById("cancel").disabled = true;
  statusEl.textContent = "Đã hủy tất cả tác vụ";
  liveBadge.textContent = "ORIGINAL 1:1 · ZERO-TOUCH";
  queue.forEach((j) => { if (j.status === "RUNNING") j.status = "IDLE"; });
  activeWorkersCount = 0;
  renderQueue();
  updateStats();
}

function downloadJobSrt(outPath) {
  window.location.href = "/api/srt?path=" + outPath + "&download=1";
}

async function copyJobSrt(outPath) {
  try {
    const res = await fetch("/api/srt?path=" + outPath);
    if (!res.ok) throw new Error("Không đọc được file SRT");
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    statusEl.textContent = "Đã copy nội dung .SRT vào Clipboard!";
  } catch (err) {
    alert(err.message);
  }
}

// Compatibility functions for test runner
function start() { startBatch(); }
function cancelJob() { cancelBatch(); }
function downloadSrt() {
  const done = queue.find((j) => j.status === "DONE" && j.outputPath);
  if (done) downloadJobSrt(encodeURIComponent(done.outputPath));
  else if (lastOutputPath) downloadJobSrt(encodeURIComponent(lastOutputPath));
}
function copySrt() {
  const done = queue.find((j) => j.status === "DONE" && j.outputPath);
  if (done) copyJobSrt(encodeURIComponent(done.outputPath));
  else if (lastOutputPath) copyJobSrt(encodeURIComponent(lastOutputPath));
}

let currentFsParent = "";
async function openFs() {
  await loadFs("");
  document.getElementById("fsDialog").showModal();
}

async function loadFs(p) {
  const data = await api("/api/fs?path=" + encodeURIComponent(p));
  document.getElementById("fsPath").textContent = data.path;
  currentFsParent = data.parent || data.path;

  const rootsEl = document.getElementById("fsRoots");
  rootsEl.innerHTML = "";
  if (Array.isArray(data.roots)) {
    for (const r of data.roots) {
      const b = document.createElement("button");
      b.className = "btn-sm";
      b.textContent = r.label;
      b.onclick = () => loadFs(r.path);
      rootsEl.appendChild(b);
    }
  }

  const list = document.getElementById("fsList");
  list.innerHTML = "";
  for (const entry of data.entries) {
    const div = document.createElement("div");
    div.className = "fs-item" + (entry.dir ? " fs-dir" : "");
    const left = document.createElement("span");
    left.textContent = (entry.dir ? "[Thư mục] " : "[Media] ") + entry.name;
    const right = document.createElement("span");
    right.className = "fs-size";
    right.textContent = entry.dir ? "" : fmtBytes(entry.size);
    div.appendChild(left);
    div.appendChild(right);
    div.onclick = async () => {
      if (entry.dir) await loadFs(entry.path);
      else {
        document.getElementById("fsDialog").close();
        addQueueItem(entry.path, entry.name, entry.size);
      }
    };
    list.appendChild(div);
  }
}

async function fsUp() {
  if (currentFsParent) await loadFs(currentFsParent);
}

setSpeed(1.0);
</script>
</body>
</html>`;function yr(e){let t=String(e??"").toLowerCase();return t==="127.0.0.1"||t==="localhost"||t==="::1"||t==="[::1]"||t===we.toLowerCase()}c(yr,"isLoopbackHost");function Wo(e){let t=String(e.headers.host??"").trim();if(!t)return!1;let n;try{n=new URL(`http://${t}`)}catch{return!1}if(!yr(n.hostname)||n.port!==String(bt))return!1;let r=e.headers.origin;if(r==null)return!0;try{let o=new URL(r);return yr(o.hostname)&&o.port===String(bt)}catch{return!1}}c(Wo,"sameOriginGuard");function Q(e,t,n){e.writeHead(t,{"Content-Type":"application/json; charset=utf-8"}),e.end(JSON.stringify(n))}c(Q,"json");function Sr(){let e=[{label:"Thư mục dự án",path:process.cwd()}],t=We.homedir();if(t&&Z.existsSync(t)){e.push({label:"Home",path:t});for(let n of["Downloads","Videos","Desktop"]){let r=q.join(t,n);Z.existsSync(r)&&e.push({label:n,path:r})}}if(process.platform==="win32")for(let n of["C","D","E","F","G"]){let r=`${n}:\\`;Z.existsSync(r)&&e.push({label:`Ổ ${n}:`,path:r})}else e.push({label:"/",path:"/"});return e}c(Sr,"discoverRoots");function Yo(e){let t=z.lastBrowsedDir&&Z.existsSync(z.lastBrowsedDir)?z.lastBrowsedDir:process.cwd(),n=t;try{if(typeof e=="string"&&e.trim()){let s=q.resolve(e.trim());try{n=Z.statSync(s).isDirectory()?s:q.dirname(s)}catch{n=Z.existsSync(s)?s:t}}z.lastBrowsedDir=n;let r=q.dirname(n),o=Z.readdirSync(n,{withFileTypes:!0}).filter(s=>s.isDirectory()||Ye.test(s.name)).map(s=>{let i=q.join(n,s.name),a=0;if(!s.isDirectory())try{a=Z.statSync(i).size}catch{a=0}return{name:s.name,dir:s.isDirectory(),path:i,size:a}}).sort((s,i)=>s.dir===i.dir?s.name.localeCompare(i.name):s.dir?-1:1).slice(0,500);return{path:n,parent:r,roots:Sr(),entries:o}}catch(r){return{path:n,parent:q.dirname(n),roots:Sr(),entries:[],error:r?.message??String(r)}}}c(Yo,"listDir");function He(e){try{let t=Bt(e);return Number.isFinite(t?.durationS)&&t.durationS>0?t.durationS:0}catch{return 0}}c(He,"probeMediaDurationS");function Go(e,t){let n=q.basename(String(e??"").trim());if(!n||!Number.isFinite(t)||t<=0)return{found:!1};let r=We.homedir(),o=[z.lastBrowsedDir,process.cwd(),r?q.join(r,"Downloads"):"",r?q.join(r,"Videos"):"",r?q.join(r,"Desktop"):"",r?q.join(r,"Music"):"",r||""].filter(Boolean),s=new Set;for(let i of o){let a=q.resolve(i,n);if(!s.has(a)){s.add(a);try{let l=Z.statSync(a);if(l.isFile()&&l.size===t)return{found:!0,path:a,durationS:He(a)}}catch{}}}return{found:!1}}c(Go,"resolveLocalFileByNameSize");function qo(e,t,n){let r=String(n??"").trim();if(!r){Q(t,400,{error:"Thiếu đường dẫn media"});return}let o=q.resolve(r);if(!Ye.test(o)){Q(t,403,{error:"Định dạng file không nằm trong danh sách media cho phép"});return}let s;try{s=Z.statSync(o)}catch{Q(t,404,{error:"Không tìm thấy file media"});return}if(!s.isFile()){Q(t,404,{error:"Không phải file hợp lệ"});return}let i=s.size,a=q.extname(o).toLowerCase(),l=Fo[a]??(Lo.test(a)?"audio/mpeg":"video/mp4"),u=e.headers.range;if(u){let g=/^bytes=(\d*)-(\d*)$/i.exec(String(u).trim());if(!g){t.writeHead(416,{"Content-Range":`bytes */${i}`}),t.end();return}let w=g[1]?Number.parseInt(g[1],10):0,h=g[2]?Number.parseInt(g[2],10):i-1;if(!g[1]&&g[2]){let N=Number.parseInt(g[2],10);w=Math.max(0,i-N),h=i-1}if(w>=i||h>=i||w>h){t.writeHead(416,{"Content-Range":`bytes */${i}`}),t.end();return}let p=h-w+1;t.writeHead(206,{"Content-Range":`bytes ${w}-${h}/${i}`,"Accept-Ranges":"bytes","Content-Length":p,"Content-Type":l,"Cache-Control":"no-store"});let S=Z.createReadStream(o,{start:w,end:h});S.on("error",()=>{try{t.destroy()}catch{}}),e.on("close",()=>{try{S.destroy()}catch{}}),S.pipe(t);return}t.writeHead(200,{"Accept-Ranges":"bytes","Content-Length":i,"Content-Type":l,"Cache-Control":"no-store"});let d=Z.createReadStream(o);d.on("error",()=>{try{t.destroy()}catch{}}),e.on("close",()=>{try{d.destroy()}catch{}}),d.pipe(t)}c(qo,"serveMediaRange");async function Vo(e){if(z.running)throw new f("Một job đang chạy — hủy hoặc chờ hoàn tất");let t=String(e?.input??"").trim();if(!t)throw new f("Thiếu đường dẫn input");let n=null;try{n=Z.statSync(t)}catch{throw new f(`Không tìm thấy file: ${t}`)}if(!n.isFile())throw new f(`Không tìm thấy file: ${t}`);let r=q.extname(t),s=(typeof e?.output=="string"?e.output.trim():"")||(r?t.slice(0,-r.length)+".srt":t+".srt"),i=q.resolve(t),a=q.resolve(s);if(!a||a===i)throw new f(`Đường dẫn output không hợp lệ: ${s}`);try{if(!Z.statSync(q.dirname(a)).isDirectory())throw new f(`Thư mục output không hợp lệ: ${q.dirname(a)}`)}catch(p){throw p instanceof f?p:new f(`Thư mục output không tồn tại: ${q.dirname(a)}`)}let l=e?.model===_t?_t:wt,u=Number.isInteger(e?.workers)&&e.workers>0?Math.min(e.workers,16):null,d=pt;if(e?.speed!==void 0&&e?.speed!==null)try{d=mt(Number(e.speed))}catch{throw new f(`Tốc độ (speed) phải nằm trong khoảng [${Et}, ${At}]`)}let g=String(e?.jobId||"job-"+Date.now()+"-"+Math.random().toString(36).slice(2,7)),w=new Nt,h={id:g,input:i,output:a,token:w,startedAtMs:performance.now(),lastProgress:0,cueCount:0};return z.activeJobs.set(g,h),z.running=!0,z.token=w,(async()=>{try{let p=await new pe(w,(S,N)=>{h.lastProgress=An(h.lastProgress,S),z.lastProgress=h.lastProgress,ge("progress",{jobId:g,value:h.lastProgress,message:N})}).run(Ae({inputPath:i,outputPath:a,model:l,language:null,jianyingAppVersion:"10.9.0",maxWorkers:u,speed:d,physicalSpeed:!1,formats:["srt"],srtOnly:!0,noJunk:!0}));h.cueCount=p.segments.length,z.lastOutput=p.outputPath,ge("done",{jobId:g,cues:p.segments.length,elapsed:p.elapsed,output:p.outputPath,speed:p.speed,eta:se(p.elapsed,1),throughput:En(p.segments.length,p.elapsed)})}catch(p){Yt(p)?ge("cancelled",{jobId:g}):ge("failed",{jobId:g,error:p instanceof f?p.describe():p?.stack??String(p)})}finally{z.activeJobs.delete(g),z.running=z.activeJobs.size>0,z.running||(z.token=null)}})(),{ok:!0,jobId:g,speed:d,output:a}}c(Vo,"startJob");function Ko({openBrowser:e=!0}={}){let t=Po.createServer(async(n,r)=>{let o=new URL(n.url,`http://${we}:${bt}`);try{if(!Wo(n)){Q(r,403,{error:"forbidden"});return}if(o.pathname==="/events"){if(z.clients.size>=Bo){Q(r,503,{error:"Quá nhiều client SSE — thử lại sau"});return}r.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive"}),r.write(`: connected

`),r.on("error",()=>z.clients.delete(r)),z.clients.add(r),n.on("close",()=>z.clients.delete(r));return}if(o.pathname==="/api/start"&&n.method==="POST"){if(!String(n.headers["content-type"]??"").includes("application/json")){Q(r,415,{error:"Content-Type phải là application/json"});return}let i=Number.parseInt(String(n.headers["content-length"]??""),10);if(Number.isFinite(i)&&i>br){Q(r,413,{error:"POST body quá lớn (giới hạn 1MB)"});try{n.resume()}catch{}return}let a=[],l=0,u=!1;for await(let w of n){if(l+=w.length,l>br){u=!0;break}a.push(w)}if(u){Q(r,413,{error:"POST body quá lớn (giới hạn 1MB)"});return}let d;try{d=JSON.parse(Buffer.concat(a).toString("utf8")||"{}")}catch{Q(r,400,{error:"JSON không hợp lệ"});return}let g=await Vo(d);Q(r,200,g);return}if(o.pathname==="/api/cancel"&&n.method==="POST"){let s=null;try{let i=[];for await(let a of n)i.push(a);i.length&&(s=JSON.parse(Buffer.concat(i).toString("utf8")||"{}").jobId)}catch{}if(s&&z.activeJobs.has(s))z.activeJobs.get(s)?.token?.cancel();else{for(let i of z.activeJobs.values())i.token?.cancel();z.token?.cancel()}Q(r,200,{ok:!0});return}if(o.pathname==="/api/fs"){Q(r,200,Yo(o.searchParams.get("path")??""));return}if(o.pathname==="/api/probe-file"){let s=String(o.searchParams.get("path")??"").trim();if(!s){Q(r,400,{error:"Thiếu đường dẫn file"});return}let i=q.resolve(s),a;try{a=Z.statSync(i)}catch{Q(r,404,{error:`Không tìm thấy file: ${s}`});return}if(!a.isFile()){Q(r,400,{error:`Đường dẫn không phải là file: ${s}`});return}z.lastBrowsedDir=q.dirname(i),Q(r,200,{path:i,name:q.basename(i),size:a.size,durationS:He(i)});return}if(o.pathname==="/api/resolve-file"){let s=o.searchParams.get("name")??"",i=Number.parseInt(o.searchParams.get("size")??"0",10);Q(r,200,Go(s,i));return}if(o.pathname==="/api/upload"&&n.method==="POST"){let i=q.basename(String(o.searchParams.get("name")??"media.mp4").trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g,"_")||"media.mp4";if(!Ye.test(i)){Q(r,400,{error:`Định dạng file không hỗ trợ: ${i}`}),n.resume();return}let a=jo(),l=q.join(a,i);await new Promise((u,d)=>{let g=Z.createWriteStream(l);n.pipe(g),g.on("finish",u),g.on("error",d),n.on("error",d)}),Q(r,200,{ok:!0,path:l,name:i,durationS:He(l)});return}if(o.pathname==="/api/media"&&n.method==="GET"){qo(n,r,o.searchParams.get("path")??"");return}if(o.pathname==="/api/srt"&&n.method==="GET"){let s=String(o.searchParams.get("path")??z.lastOutput??"").trim();if(!s){Q(r,404,{error:"Chưa có file SRT"});return}let i=q.resolve(s);if(!i.toLowerCase().endsWith(".srt")||!Z.existsSync(i)){Q(r,404,{error:"Không tìm thấy file SRT"});return}let a=o.searchParams.get("download")==="1",l=q.basename(i);r.writeHead(200,{"Content-Type":"text/plain; charset=utf-8",...a?{"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(l)}`}:{}}),Z.createReadStream(i).pipe(r);return}if(o.pathname==="/"){r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}),r.end(Ho.replace("${MODELS_OPTIONS}",Jo));return}Q(r,404,{error:"not found"})}catch(s){Q(r,400,{error:s instanceof f?s.describe():String(s?.message??s)})}});return new Promise((n,r)=>{t.on("error",s=>{r(new f(s?.code==="EADDRINUSE"?`Port ${bt} đang bị chiếm — đặt ASR_GUI_PORT=<port khác>`:`GUI server lỗi: ${s?.message??s}`))});let o=setInterval(zo,Do);try{o.unref?.()}catch{}t.on("close",()=>clearInterval(o)),t.listen(bt,we,()=>{let s=`http://${we}:${bt}`;if(process.stdout.write(`ASR Studio UltraX GUI · ${s}
`),e)try{let i=!1;if(process.platform==="win32"){let a=["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",q.join(process.env.LOCALAPPDATA||"","Google\\Chrome\\Application\\chrome.exe"),"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];for(let l of a)if(l&&Z.existsSync(l)){let u=me(l,[`--app=${s}`],{detached:!0,stdio:"ignore"});u.on("error",()=>{}),u.unref?.(),i=!0;break}if(!i){let l=me("cmd",["/c","start","",s],{detached:!0,stdio:"ignore"});l.on("error",()=>{}),l.unref?.()}}else if(process.platform==="darwin"){let a=me("open",[s],{detached:!0,stdio:"ignore"});a.on("error",()=>{}),a.unref?.()}else{let a=me("xdg-open",[s],{detached:!0,stdio:"ignore"});a.on("error",()=>{}),a.unref?.()}}catch{}n(t)})})}c(Ko,"startGui");async function Xo(){await Ko({openBrowser:process.env.ASR_GUI_NO_OPEN!=="1"}),setInterval(()=>{},1<<30)}c(Xo,"main");process.argv[1]&&import.meta.url===Oo(process.argv[1]).href&&Xo();export{Xo as main,Ko as startGui};
//# sourceMappingURL=gui.bundle.mjs.map
