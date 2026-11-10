var $r=Object.defineProperty;var c=(e,t)=>$r(e,"name",{value:t,configurable:!0});import{spawn as ve}from"node:child_process";import Z from"node:fs";import ns from"node:http";import tn from"node:os";import V from"node:path";import{pathToFileURL as rs}from"node:url";import ne from"node:fs";function Pr(e){if(typeof e=="string")return e;try{return JSON.stringify(e)}catch{return String(e)}}c(Pr,"stringifyDetail");var f=class extends Error{static{c(this,"ASRError")}constructor(t="",{detail:n,cause:r}={}){super(t,r!==void 0?{cause:r}:void 0),this.name=new.target.name,this.message=t,this.detail=n,r!==void 0&&(this.cause=r)}describe(){return this.message&&this.detail!==void 0&&this.detail!==null?`${this.message} (${Pr(this.detail)})`:this.message||this.name}toString(){return this.describe()}},lt=class extends f{static{c(this,"AppError")}},ot=class extends f{static{c(this,"CancelledError")}},X=class extends f{static{c(this,"ProviderError")}constructor(t="",{provider:n,phase:r,detail:o,retryable:s=!1,cause:i}={}){super(t,{detail:o,...i!==void 0?{cause:i}:{}}),this.provider=n,this.phase=r,this.retryable=!!s,i!==void 0&&(this.cause=i)}describe(){let t=super.describe(),n=`[${this.provider}/${this.phase}]`;return t&&t!==this.name?`${n} ${t}`:n}},Zt=class extends f{static{c(this,"ExportError")}},xt=class extends f{static{c(this,"CircuitOpenError")}},et=class extends f{static{c(this,"NetworkError")}constructor(t,{detail:n=null,connectPhase:r=!1,cause:o}={}){super(t,{detail:n,...o!==void 0?{cause:o}:{}}),this.transient=!0,this.connectPhase=r,o!==void 0&&(this.cause=o)}},Dt=class extends et{static{c(this,"ConnectTimeoutError")}constructor(t,n={}){super(t,{...n,connectPhase:!0})}},Bt=class extends et{static{c(this,"ReadTimeoutError")}constructor(t,n={}){super(t,n)}};function te(e){return e instanceof ot||e?.name==="CancelledError"}c(te,"isCancelled");import ee from"node:fs";var Ct=Object.freeze([96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350]),Ne=class{static{c(this,"BitReader")}#t;#e=0;constructor(t){this.#t=t}take(t){let n=0;for(let r=0;r<t;r++){let o=this.#t[this.#e>>3];if(o===void 0)throw new f("ASC kết thúc sớm — DecoderSpecificInfo hỏng");n=n<<1|o>>7-(this.#e&7)&1,this.#e+=1}return n}},ke=class{static{c(this,"MetaReader")}#t;constructor(t){this.#t=t}read(t,n){let r=Buffer.allocUnsafe(n),o=0;for(;o<n;){let s=ee.readSync(this.#t,r,o,n-o,Number(t)+o);if(s<=0)throw new f(`MP4 đọc hụt ${n-o}B tại offset ${Number(t)+o}`);o+=s}return r}u32(t){return this.read(t,4).readUInt32BE(0)}u64(t){return this.read(t,8).readBigUInt64BE(0)}type(t){return this.read(t,4).toString("latin1")}};function*At(e,t,n,r){let o=BigInt(t),s=BigInt(n);for(;o<s;){if(o+8n>s)throw new f(`${r}: box header vượt ranh giới`);let i=e.u32(Number(o)),a=8;if(i===1){let u=e.u64(Number(o)+8);if(u<16n)throw new f(`${r}: box largesize ${u} < header`);if(i=Number(u),!Number.isSafeInteger(i))throw new f(`${r}: box quá lớn vượt giới hạn JS`);a=16}else i===0&&(i=Number(s-o));if(i<a)throw new f(`${r}: box size ${i} < header`);if(o+BigInt(i)>s)throw new f(`${r}: box vượt EOF`);yield{type:e.type(Number(o)+4),start:o,dataStart:o+BigInt(a),size:i},o+=BigInt(i)}}c(At,"iterBoxes");var nt=c(e=>Number(e.start+BigInt(e.size)),"endOf");function dt(e,t,n,r){if(!Number.isInteger(t)||!Number.isInteger(n)||t<0||n<0||t+n>e.length)throw new f(`${r}: box cụt (cần [${t},${t+n}) trong ${e.length}B)`)}c(dt,"need");function it(e,t,n){return dt(e,t,4,n),e.readUInt32BE(t)}c(it,"u32b");function Or(e,t,n){return dt(e,t,4,n),e.readInt32BE(t)}c(Or,"i32b");function en(e,t,n){return dt(e,t,8,n),e.readBigUInt64BE(t)}c(en,"u64b");function vt(e,t,n,r,o){for(let s of At(e,t,n,o))if(s.type===r)return s;return null}c(vt,"findBox");function _e(e,t){if(t>=e.length)throw new f("esds: descriptor thiếu tag");let n=e[t++],r=0;for(let o=0;o<4;o++){if(t>=e.length)throw new f("esds: descriptor thiếu length");let s=e[t++];if(r=r<<7|s&127,!(s&128))break}if(t+r>e.length)throw new f("esds: descriptor vượt payload");return{tag:n,start:t,len:r}}c(_e,"readDescriptor");function Lr(e){if(!e||e.length<2)throw new f("ASC rỗng/hỏng");let t=new Ne(e),n=t.take(5);n===31&&(n=32+t.take(6));let r=t.take(4),o=t.take(4);if(r===15){let i=t.take(24),a=Ct.indexOf(i);if(a<0)throw new f(`AAC sample rate ${i}Hz không biểu diễn được trong ADTS`);return s(n,a,i,o)}if(r>=Ct.length)throw new f(`ASC freq index ${r} không hợp lệ`);return s(n,r,Ct[r],o);function s(i,a,l,u){if(u===0||u>7)throw new f(`ASC channel config ${u} không hỗ trợ (cần 1–7)`);return{audioObjectType:i,freqIdx:a,sampleRate:l,chanCfg:u}}}c(Lr,"parseAsc");function Fr(e,t){let n=_e(e,0);if(n.tag!==3)throw new f(`${t}: esds thiếu ES_Descriptor (tag ${n.tag})`);let r=n.start+2;if(r>=e.length)throw new f(`${t}: esds ES_Descriptor cụt`);let o=e[r++];if(o&128&&(r+=2),o&64){if(r>=e.length)throw new f(`${t}: esds URL_Flag cụt`);r+=1+e[r]}o&32&&(r+=2);let s=_e(e,r);if(s.tag!==4)throw new f(`${t}: esds thiếu DecoderConfigDescriptor (tag ${s.tag})`);if(s.start>=e.length)throw new f(`${t}: DecoderConfigDescriptor cụt`);let i=e[s.start];if(i!==64&&!(i>=102&&i<=104))throw new f(`${t}: audio object type 0x${i.toString(16)} không phải AAC — NO-FALLBACK`);let a=s.start+13;if(a>=e.length)throw new f(`${t}: mp4a thiếu DecoderSpecificInfo (ASC)`);let l=_e(e,a);if(l.tag!==5)throw new f(`${t}: esds thiếu DecoderSpecificInfo (tag ${l.tag})`);return e.subarray(l.start,l.start+l.len)}c(Fr,"parseEsdsPayload");function nn(e,t,n,r){for(let o of At(e,t,n,r)){if(o.type==="esds"){let s=e.read(Number(o.dataStart)+4,nt(o)-(Number(o.dataStart)+4));return Fr(s,r)}if(o.type==="wave"){let s=nn(e,Number(o.dataStart),nt(o),`${r}/wave`);if(s)return s}}return null}c(nn,"findAscInEntry");function Mt(e,t,n,r){let o=vt(e,Number(t.dataStart),nt(t),n,r);if(!o)throw new f(`${r}: thiếu ${n}`);return o}c(Mt,"requireChild");function Dr(e,t,n){let r=vt(e,Number(Br(t)),nt(t),"tkhd",n);if(!r)return 1;let o=e.read(Number(r.dataStart),1)[0];return e.u32(Number(r.dataStart)+(o===1?20:12))}c(Dr,"parseTrackId");function Br(e){return e.dataStart}c(Br,"tkhdBox");function jr(e,t){let n=new Map,r=vt(e,Number(t.dataStart),nt(t),"mvex","moov/mvex");if(!r)return n;for(let o of At(e,Number(r.dataStart),nt(r),"mvex")){if(o.type!=="trex")continue;let s=e.read(Number(o.dataStart)+4,nt(o)-(Number(o.dataStart)+4));if(s.length>=20){let i=s.readUInt32BE(0);n.set(i,{defaultSampleDescIdx:s.readUInt32BE(4),defaultSampleDuration:s.readUInt32BE(8),defaultSampleSize:s.readUInt32BE(12),defaultSampleFlags:s.readUInt32BE(16)})}}return n}c(jr,"parseTrexDefaults");function Ur(e,t,n){let r=vt(e,Number(t.dataStart),nt(t),"mdia",n);if(!r)return null;let o=vt(e,Number(r.dataStart),nt(r),"hdlr",n);if(!o||e.type(Number(o.dataStart)+8)!=="soun")return null;let i=Dr(e,t,n),a=Mt(e,r,"mdhd",n),l=e.read(Number(a.dataStart),1)[0],u,p;if(l===1)u=e.u32(Number(a.dataStart)+20),p=e.u64(Number(a.dataStart)+24);else if(l===0)u=e.u32(Number(a.dataStart)+12),p=e.u32(Number(a.dataStart)+16);else throw new f(`${n}: mdhd version ${l} không hỗ trợ (cần 0/1)`);if(!u)throw new f(`${n}: timescale 0 — timeline hỏng`);let h=`${n}/stbl`,b=Mt(e,r,"minf",n),m=Mt(e,b,"stbl",h),g=Mt(e,m,"stsd",h);if(e.u32(Number(g.dataStart)+4)<1)throw new f(`${h}: stsd rỗng`);let E=Number(g.dataStart)+8,C=nt(g);if(E+8>C)throw new f(`${h}: stsd cụt trước sample entry`);let x=e.u32(E);if(!Number.isSafeInteger(x)||x<8)throw new f(`${h}: sample entry size ${x} vô lý`);let S=Math.min(E+x,C),d=e.type(E+4),y,$=null;if(d==="enca")throw new f(`${h}: audio track bị mã hóa DRM — không xử lý được`);if(d==="mp4a"){let N=E+8,O=e.read(N+8,2).readUInt16BE(0);if(O!==0&&O!==1&&O!==2)throw new f(`${h}: mp4a version ${O} không hỗ trợ (cần 0/1/2)`);let B=O===2?36:O===1?16:0,z=N+28+B;if(z>S)throw new f(`${h}: mp4a entry size ${x} quá nhỏ cho version ${O}`);if($=nn(e,z,S,h),!$||$.length===0)throw new f(`${h}: mp4a thiếu DecoderSpecificInfo`);y="aac"}else if(d===".mp3"||d==="mp3 ")y="mp3";else throw new f(`${h}: codec audio '${d}' không hỗ trợ passthrough (hỗ trợ: mp4a/AAC, .mp3) — NO-FALLBACK`);let _=Mt(e,m,"stts",h),P=Mt(e,m,"stsc",h),k=Mt(e,m,"stsz",h),M=vt(e,Number(m.dataStart),nt(m),"stco",h)??vt(e,Number(m.dataStart),nt(m),"co64",h);if(!M)throw new f(`${h}: thiếu stco/co64`);let I=c(N=>e.read(Number(N.dataStart)+4,nt(N)-(Number(N.dataStart)+4)),"body"),R=I(_),v=it(R,0,"stts"),w={trackId:i,codec:y,...y==="aac"?{...Lr($),ascBytes:Buffer.from($)}:{},timescale:u,mediaDurationRaw:p};return v===0?(w.isFragmentedCandidate=!0,w):(zr(w,{sttsBody:R,stscBody:I(P),stszBody:I(k),stcoKind:M.type,stcoBody:I(M)}),w)}c(Ur,"parseAudioTrak");function zr(e,t){let n=t.sttsBody;dt(n,0,4,"stts");let r=it(n,0,"stts");if(r===0)throw new f("stts rỗng — timeline rỗng");dt(n,0,4+r*8,"stts");let o=new Uint32Array(r),s=new Uint32Array(r),i=new Float64Array(r),a=new Float64Array(r),l=0,u=0;for(let D=0,T=4;D<r;D++,T+=8){let L=it(n,T,"stts"),F=it(n,T+4,"stts");if(!(L>=1))throw new f(`stts hàng ${D} count ${L} vô lý (cần ≥1)`);if(!(F>=1))throw new f(`stts hàng ${D} delta ${F} vô lý (cần ≥1)`);o[D]=L,s[D]=F,l+=L,u+=L*F,i[D]=l,a[D]=u}let p=l,h=e.timescale||1;e.auCount=p;let b=0;e.auDtsS=c(function(T){if(!Number.isInteger(T)||T<0||T>=p)throw new f(`AU index ${T} ngoài [0,${p})`);let L=b,F=L>0?i[L-1]:0;if(T<F||T>=i[L]){if(L+1<r&&T>=i[L]&&T<i[L+1])L+=1;else{let G=0,rt=r-1;for(L=0;G<=rt;){let tt=G+rt>>1;T<i[tt]?(L=tt,rt=tt-1):G=tt+1}}b=L}let j=L>0?i[L-1]:0;return((L>0?a[L-1]:0)+(T-j)*s[L])/h},"auDtsS");let m=r>0?a[r-1]:0,g=Number(e.mediaDurationRaw)/h;e.durationS=Math.max(m/h,g>0?g:0),e.auIndexAtS=c(function(T){if(!(T>0))return 0;let L=T*h,F=0,j=r-1,Y=r-1;for(;F<=j;){let Et=F+j>>1;a[Et]>L?(Y=Et,j=Et-1):F=Et+1}let G=Y>0?i[Y-1]:0,rt=Y>0?a[Y-1]:0,tt=s[Y];if(tt<=0)return Math.min(p-1,G);let Qt=Math.floor((L-rt)/tt);return Math.max(0,Math.min(p-1,G+Qt))},"auIndexAtS");let A=t.stszBody;dt(A,0,8,"stsz");let E=it(A,0,"stsz"),C=it(A,4,"stsz");if(E!==0&&C!==p)throw new f(`stsz count ${C} ≠ stts count ${p}`);if(E===0){if(C!==p)throw new f(`stsz count ${C} ≠ stts count ${p}`);dt(A,0,8+C*4,"stsz")}let x=t.stscBody;dt(x,0,4,"stsc");let S=it(x,0,"stsc");if(S===0)throw new f("stsc rỗng — chunk map rỗng");dt(x,0,4+S*12,"stsc");let d=new Uint32Array(S),y=new Uint32Array(S);for(let D=0,T=4;D<S;D++,T+=12){let L=it(x,T,"stsc"),F=it(x,T+4,"stsc"),j=it(x,T+8,"stsc");if(D===0&&L<1)throw new f(`stsc hàng 0 firstChunk ${L} vô lý (cần ≥1)`);if(D>0&&!(L>d[D-1]))throw new f(`stsc hàng ${D} firstChunk ${L} không tăng đơn điệu (trước ${d[D-1]})`);if(!(F>=1))throw new f(`stsc hàng ${D} samplesPerChunk ${F} vô lý (cần ≥1)`);if(!(j>=1))throw new f(`stsc hàng ${D} sampleDescIndex ${j} vô lý (cần ≥1)`);d[D]=L,y[D]=F}let $=t.stcoBody;dt($,0,4,"stco/co64");let _=it($,0,"stco/co64");if(_===0)throw new f("stco/co64 rỗng — không có chunk nào");let P=t.stcoKind==="co64";if(dt($,0,4+_*(P?8:4),"stco/co64"),d[S-1]>_)throw new f(`stsc firstChunk ${d[S-1]} vượt chunkCount ${_}`);let k=c(D=>P?Number(en($,4+D*8,"co64")):it($,4+D*4,"stco"),"chunkOffset"),M=new Float64Array(S);{let D=0;for(let T=0;T<S;T++){M[T]=D;let L=d[T]-1,j=(T+1<S?d[T+1]-1:_)-L;if(!(j>=0))throw new f(`stsc hàng ${T} phủ chunk âm`);D+=j*y[T]}}let I=c(D=>{let T=0,L=S-1,F=-1;for(;T<=L;){let j=T+L>>1;d[j]-1<=D?(F=j,T=j+1):L=j-1}if(F<0)throw new f(`stsc không phủ chunk ${D}`);return F},"rowIndexForChunk"),R=c(D=>{let T=0,L=S-1,F=0;for(;T<=L;){let j=T+L>>1;M[j]<=D?(F=j,T=j+1):L=j-1}return F},"rowIndexForAu"),v=c(D=>{let T=R(D);for(;T+1<S&&M[T+1]<=D;)T++;for(;T>0&&M[T]>D;)T--;let L=y[T];if(!(L>0))throw new f(`stsc hàng ${T} samplesPerChunk vô lý`);let F=d[T]-1+Math.floor((D-M[T])/L);for(;T+1<S&&F>=d[T+1]-1;){T++;let j=y[T];F=d[T]-1+Math.floor((D-M[T])/j)}return F<0&&(F=0),F>=_&&(F=_-1),F},"chunkForAu"),w=0,N=0,O=0,B=0,z=_>0?k(0):0,J=c(()=>{w=0,N=0,O=0,B=0,z=_>0?k(0):0,b=0},"resetCursor"),H=c(D=>E!==0?E:A.readUInt32BE(8+D*4),"auSizeAt"),K=c(D=>{let T=v(D),L=I(T),F=M[L]+(T-(d[L]-1))*y[L],j=D-F,Y=k(T),G;if(E!==0)G=Y+j*E;else{G=Y;for(let rt=0;rt<j;rt++)G+=H(F+rt)}return w=L,N=T,O=F,B=D,z=G,{pos:G,size:H(D)}},"auLocationDirect");e.auLocation=c(function(T){if(!Number.isInteger(T)||T<0||T>=p)throw new f(`AU index ${T} ngoài phạm vi`);if(T<B||T-B>64)return K(T);for(;B<T;){let L=y[w];if(B+1-O>=L){if(N+=1,N>=_)throw new f("stco hết chunk trước khi hết AU");O=B+1,w+1<S&&N>=d[w+1]-1&&(w+=1),z=k(N)}else z+=H(B);B+=1}return{pos:z,size:H(B)}},"auLocation"),e.iterateAus=c(function*(T=0,L=p){if(!Number.isInteger(T)||!Number.isInteger(L))throw new f(`MP4 iterateAus [${T},${L}) không phải số nguyên`);if(T<0||L>p||L<T)throw new f(`MP4 iterateAus [${T},${L}) ngoài [0,${p}]`);J();let F=-1;for(let j=T;j<L;j++){let Y=e.auLocation(j);if(Y.pos<F)throw new f(`MP4: AU ${j} nằm lùi vị trí file (${Y.pos} < ${F}) — muxer bất thường, từ chối cắt`);F=Y.pos,yield{index:j,pos:Y.pos,size:Y.size,dtsS:e.auDtsS(j)}}},"iterateAus")}c(zr,"attachSampleTable");function Jr(e,t,n,r,o){let s=o.get(r.trackId)??{defaultSampleDuration:1024,defaultSampleSize:0},i=[],a=[],l=[],u=0;for(let A of At(e,0,t,n)){if(A.type!=="moof")continue;let E=Number(A.start),C=nt(A);for(let x of At(e,Number(A.dataStart),C,`${n}/moof`)){if(x.type!=="traf")continue;let S=vt(e,Number(x.dataStart),nt(x),"tfhd","traf/tfhd");if(!S)continue;let d=e.read(Number(S.dataStart),nt(S)-Number(S.dataStart));if(d.length<8)continue;let y=(d[1]<<16|d[2]<<8|d[3])>>>0;if(d.readUInt32BE(4)!==r.trackId)continue;let _=8,P=E;y&1&&(P=Number(en(d,_,"tfhd")),_+=8),y&2&&(_+=4);let k=s.defaultSampleDuration;y&8&&(k=it(d,_,"tfhd"),_+=4);let M=s.defaultSampleSize;y&16&&(M=it(d,_,"tfhd"),_+=4);let I=P;for(let R of At(e,Number(x.dataStart),nt(x),"traf")){if(R.type!=="trun")continue;let v=e.read(Number(R.dataStart),nt(R)-Number(R.dataStart));if(v.length<8)continue;let w=(v[1]<<16|v[2]<<8|v[3])>>>0,N=v.readUInt32BE(4),O=8;if(w&1){let K=Or(v,O,"trun");I=P+K,O+=4}w&4&&(O+=4);let B=(w&256)!==0,z=(w&512)!==0,J=(w&1024)!==0,H=(w&2048)!==0;for(let K=0;K<N;K++){let D=B?it(v,O,"trun/dur"):k;B&&(O+=4);let T=z?it(v,O,"trun/size"):M;if(z&&(O+=4),J&&(O+=4),H&&(O+=4),!(T>0)||!(D>0))throw new f("fMP4 trun: sample size/duration bằng 0 hoặc thiếu default");i.push(I),a.push(T),l.push(u),I+=T,u+=D}}}}let p=i.length;if(p===0)throw new f("stts rỗng — timeline rỗng");let h=Float64Array.from(i),b=Uint32Array.from(a),m=Float64Array.from(l),g=r.timescale||1;r.auCount=p,r.durationS=u/g,delete r.isFragmentedCandidate,r.auDtsS=c(function(E){if(!Number.isInteger(E)||E<0||E>=p)throw new f(`AU index ${E} ngoài [0,${p})`);return m[E]/g},"auDtsS"),r.auIndexAtS=c(function(E){if(!(E>0))return 0;let C=E*g,x=0,S=p-1,d=p-1;for(;x<=S;){let y=x+S>>1;m[y]>=C?(d=y,S=y-1):x=y+1}return d},"auIndexAtS"),r.auLocation=c(function(E){if(!Number.isInteger(E)||E<0||E>=p)throw new f(`AU index ${E} ngoài phạm vi`);return{pos:h[E],size:b[E]}},"auLocation"),r.iterateAus=c(function*(E=0,C=p){if(!Number.isInteger(E)||!Number.isInteger(C))throw new f(`MP4 iterateAus [${E},${C}) không phải số nguyên`);if(E<0||C>p||C<E)throw new f(`MP4 iterateAus [${E},${C}) ngoài [0,${p}]`);for(let x=E;x<C;x++)yield{index:x,pos:h[x],size:b[x],dtsS:m[x]/g}},"iterateAus")}c(Jr,"attachFragmentedSampleTable");function rn(e){let t=ee.openSync(e,"r");try{let n=new ke(t),r=ee.fstatSync(t).size,o=[],s=[],i=!1,a=new Map;for(let u of At(n,0,r,e))if(u.type==="moov"){i=!0,a=jr(n,u);for(let p of At(n,Number(u.dataStart),nt(u),`${e}/moov`))if(p.type==="trak")try{let h=Ur(n,p,`${e}/trak#${o.length+s.length}`);h&&(h.isFragmentedCandidate&&Jr(n,r,e,h,a),o.push(h))}catch(h){s.push(h?.message??String(h))}}if(!i)throw new f("MP4 không có moov — fragmented (moof) hoặc file hỏng");let l=o.find(u=>u.codec==="aac"||u.codec.startsWith("mp3"));if(!l){let u=s.length>0?` · lý do: ${s.join(" | ")}`:"";throw new f(`MP4 không có audio track hỗ trợ passthrough${u}`)}return{kind:l.codec==="aac"?"mp4-aac":"mp4-mp3",durationS:l.durationS,track:l,rejectedTracks:s}}finally{ee.closeSync(t)}}c(rn,"inspectMp4");function Te(e){if(e>=1&&e<=4)return e-1;if(e===5||e===29)return 1;throw new f(`AOT ${e} không đóng gói được vào ADTS (chỉ AOT 1–4, 5, 29)`)}c(Te,"adtsProfile");import jt from"node:fs";var Hr=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],on=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],Wr=[0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],Yr=[0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],Gr=[[44100,48e3,32e3],[22050,24e3,16e3],[11025,12e3,8e3]],qr=Object.freeze({3:0,2:1,0:2}),Rt={versionBits:0,layer:0,bitrateKbps:0,sampleRate:0,samplesPerFrame:0,size:0,channelMode:0},Vr={versionBits:0,layer:0,bitrateKbps:0,sampleRate:0,samplesPerFrame:0,size:0,channelMode:0};function sn(e,t){if(e[0]!==255||(e[1]&224)!==224)return!1;let n=e[1]>>3&3,r=e[1]>>1&3;if(n===1||r===0)return!1;let o=e[2]>>4&15,s=e[2]>>2&3;if(o===0||o===15||s===3)return!1;let i=e[2]>>1&1,a=e[3]>>6&3,l=4-r,u;l===3?u=(n===3?Hr:on)[o]:l===2?u=n===3?Yr[o]:on[o]:u=Wr[o];let p=qr[n],h=p===void 0?0:Gr[p][s];if(!h||!u)return!1;let b=l===1?384:l===2||n===3?1152:576,m=l===1?(Math.floor(12*u*1e3/h)+i)*4:Math.floor(b/8*u*1e3/h)+i;return m>=1?(t.versionBits=n,t.layer=l,t.bitrateKbps=u,t.sampleRate=h,t.samplesPerFrame=b,t.size=m,t.channelMode=a,!0):!1}c(sn,"parseFrameHeaderInto");function Kr(e,t,n){let r=n===3,s=4+(t===3?r?17:32:r?9:17);if(s+4<=e.length){let i=e.toString("latin1",s,s+4);if(i==="Xing"||i==="Info")return!0}return e.length>=40&&e.toString("latin1",36,40)==="VBRI"}c(Kr,"isVbrHeaderFrame");function an(e){let t=jt.openSync(e,"r");try{let n=jt.fstatSync(t).size,r=0,o=Buffer.alloc(10);if(jt.readSync(t,o,0,10,0)>=10&&o.toString("latin1",0,3)==="ID3"){for(let N=6;N<=9;N++)if(o[N]&128)throw new f("MP3: ID3 syncsafe size hỏng (bit cao đặt)");if(r=10+((o[6]&127)<<21|(o[7]&127)<<14|(o[8]&127)<<7|o[9]&127)+(o[5]&16?10:0),!(r>=10&&r<=n))throw new f(`MP3: ID3 tag vượt EOF (tag end ${r} > file ${n})`)}let i=[],a=1<<20,l=Buffer.allocUnsafe(a),u=-1,p=-1,h=c(w=>{let N=Math.max(0,Math.min(w,Math.max(0,n-1))),O=Math.min(n,N+a),B=0;for(;B<O-N;){let z=jt.readSync(t,l,B,O-N-B,N+B);if(z<=0)break;B+=z}u=N,p=N+B},"loadWin"),b=c((w,N)=>w<0||w+N>n||(w<u||w+N>p)&&(h(w),w<u||w+N>p)?null:l.subarray(w-u,w-u+N),"readSpan"),m=0,g=r,A=0,E=!1,C=0,x=0,S=0,d=0,y=!1,$=!1;for(;;){let w=b(r,4);if(w===null)break;if(!sn(w,Rt)){if(d+=1,d>512)throw new f(`MP3: quá nhiều điểm sync hỏng (${d}) — file lỗi`);let J=r+1,H=!1;for(;J<n-4&&J-r<4096;){let K=b(J,4);if(K!==null&&sn(K,Vr)){H=!0;break}J+=1}if(!H)break;r=J,y=!0;continue}let O=Rt.size,B=Rt.samplesPerFrame,z=Rt.sampleRate;if(r+O>n)break;if(!$){$=!0;let J=b(r,O);if(J&&Kr(J,Rt.versionBits,Rt.channelMode)){r+=O,g=r,y=!0;continue}}E&&!y&&C===O&&x===B&&S===z?m+=1:(E&&m>0&&i.push({start:A,frames:m-A,size:C,samplesPerFrame:x,sampleRate:S,startPos:g}),g=r,A=m,C=O,x=B,S=z,E=!0,m+=1,y=!1),r+=O}E&&m>0&&i.push({start:A,frames:m-A,size:C,samplesPerFrame:x,sampleRate:S,startPos:g});let _=0,P=0;for(let w of i)w.startAbs=_,w.startSec=P,_+=w.frames,P+=w.frames*w.samplesPerFrame/w.sampleRate;if(_===0)throw new f("MP3: không tìm thấy frame nào hợp lệ");let k=_,M=0,I=c(w=>{let N=i[M];if(N&&w>=N.startAbs&&w<N.startAbs+N.frames)return N;let O=i[M+1];if(O&&w>=O.startAbs&&w<O.startAbs+O.frames)return M+=1,O;let B=0,z=i.length-1;for(;B<=z;){let J=B+z>>1;w<i[J].startAbs?z=J-1:B=J+1}return M=z>=0?z:0,i[M]},"runFor"),v={codec:"mp3",sampleRate:i[0].sampleRate,auCount:k,durationS:P,auDtsS:c(w=>{if(!Number.isInteger(w)||w<0||w>=k)throw new f(`frame ${w} ngoài phạm vi`);let N=I(w);return N.startSec+(w-N.startAbs)*N.samplesPerFrame/N.sampleRate},"auDtsS"),auIndexAtS:c(w=>{if(!(w>0))return 0;let N=0,O=i.length-1,B=i.length-1;for(;N<=O;){let J=N+O>>1,H=i[J],K=H.frames*H.samplesPerFrame/H.sampleRate;w<H.startSec+K?(B=J,O=J-1):N=J+1}let z=i[B];return Math.min(k-1,z.startAbs+Math.floor((w-z.startSec)*z.sampleRate/z.samplesPerFrame))},"auIndexAtS"),auLocation:c(w=>{if(!Number.isInteger(w)||w<0||w>=k)throw new f(`frame ${w} ngoài phạm vi`);let N=I(w);return{pos:N.startPos+(w-N.startAbs)*N.size,size:N.size}},"auLocation"),*iterateAus(w=0,N=k){if(!Number.isInteger(w)||!Number.isInteger(N))throw new f(`MP3 iterateAus [${w},${N}) không phải số nguyên`);if(w<0||N>k||N<w)throw new f(`MP3 iterateAus [${w},${N}) ngoài [0,${k}]`);for(let O=w;O<N;O++){let B=v.auLocation(O);yield{index:O,...B,dtsS:v.auDtsS(O)}}}};return{kind:"mp3",durationS:v.durationS,track:v,resyncs:d}}finally{jt.closeSync(t)}}c(an,"inspectMp3");import $t from"node:fs";function cn(e,t,n,r,o=1){if(!Number.isSafeInteger(e)||e<0)throw new f("WAV header: dataBytes không hợp lệ");if(!Number.isInteger(t)||t<1||t>64)throw new f(`WAV header: channels ${t} ngoài [1,64]`);if(!Number.isInteger(n)||n<1e3||n>768e3)throw new f(`WAV header: sampleRate ${n} ngoài [1000,768000]`);if(![8,16,24,32].includes(r))throw new f(`WAV header: bits ${r} không hỗ trợ (cần 8/16/24/32)`);if(t*r%8!==0)throw new f("WAV header: channels*bits không chia hết cho 8");let s=Math.floor(t*r/8);if(!(s>=1&&s<=65535))throw new f(`WAV header: blockAlign ${s} ngoài [1,65535]`);let i=n*s;if(!Number.isSafeInteger(i)||i<1||i>4294967295)throw new f(`WAV header: byteRate ${i} vượt uint32`);if(36+e>4294967295)throw new f("WAV >4GB cần RF64 — NO-FALLBACK, dùng MP4/M4A thay thế");let a=Buffer.alloc(44);return a.write("RIFF",0,"latin1"),a.writeUInt32LE(36+e,4),a.write("WAVE",8,"latin1"),a.write("fmt ",12,"latin1"),a.writeUInt32LE(16,16),a.writeUInt16LE(o===3?3:1,20),a.writeUInt16LE(t,22),a.writeUInt32LE(n,24),a.writeUInt32LE(i,28),a.writeUInt16LE(s,32),a.writeUInt16LE(r,34),a.write("data",36,"latin1"),a.writeUInt32LE(e,40),a}c(cn,"wavHeader");function ln(e){let t=$t.openSync(e,"r");try{let n=$t.fstatSync(t).size,r=Buffer.alloc(12);if($t.readSync(t,r,0,12,0)!==12)throw new f("WAV ngắn hơn RIFF header");if(r.toString("latin1",0,4)!=="RIFF"||r.toString("latin1",8,12)!=="WAVE")throw new f("WAV: RIFF/WAVE magic sai");let o=null,s=null,i=12,a=Buffer.allocUnsafe(8);for(;i+8<=n;){let h=$t.readSync(t,a,0,8,i);if(h!==8)throw new f(`WAV đọc hụt header chunk tại ${i} (được ${h}/8B)`);let b=a.toString("latin1",0,4),m=a.readUInt32LE(4);if(b==="data"&&m===0&&(m=n-i-8),i+8+m>n&&b!=="data")break;if(b==="fmt "){if(m<16)throw new f(`WAV: fmt chunk ${m}B quá ngắn (cần ≥16)`);let g=Buffer.alloc(Math.min(m,40)),A=$t.readSync(t,g,0,g.length,i+8);if(A!==g.length)throw new f(`WAV đọc hụt fmt tại ${i} (được ${A}/${g.length}B)`);let E=g.readUInt16LE(0),C=g.readUInt16LE(2),x=g.readUInt32LE(4),S=g.readUInt32LE(8),d=g.readUInt16LE(12),y=g.readUInt16LE(14),$=E;if(E===65534&&g.length>=26&&($=g.readUInt16LE(24)),$!==1&&!($===3&&y===32))throw new f(`WAV: format ${$} không phải PCM/Float32 thuần — không hỗ trợ`);if(!Number.isInteger(C)||C<1||C>64)throw new f(`WAV: channels ${C} ngoài [1,64]`);if(!Number.isInteger(x)||x<1e3||x>768e3)throw new f(`WAV: sampleRate ${x} ngoài [1000,768000]`);if(!d||d>65535)throw new f(`WAV: blockAlign ${d} vô lý`);if(![8,16,24,32].includes(y))throw new f(`WAV: bits ${y} không hỗ trợ (cần 8/16/24/32)`);if(d!==C*y/8)throw new f(`WAV: blockAlign ${d} ≠ channels*bits/8 (${C*y/8})`);if(S!==x*d)throw new f(`WAV: byteRate ${S} ≠ sampleRate*blockAlign`);o={channels:C,sampleRate:x,blockAlign:d,bits:y,audioFormat:$}}else b==="data"&&(s={pos:i+8,size:Math.min(m,n-i-8)});i+=8+m+m%2}if(!o||!s)throw new f("WAV: thiếu fmt hoặc data chunk");if(s.size<=0)throw new f("WAV: data rỗng — không có frame nào");if(o.blockAlign%o.channels!==0)throw new f("WAV: blockAlign không khớp channels");let l=Math.floor(s.size/o.blockAlign),u=o.sampleRate,p={codec:"pcm",audioFormat:o.audioFormat,channels:o.channels,bits:o.bits,blockAlign:o.blockAlign,sampleRate:u,auCount:l,contiguous:!0,durationS:l/u,auDtsS:c(h=>{if(!Number.isInteger(h)||h<0||h>=l)throw new f(`frame ${h} ngoài phạm vi`);return h/u},"auDtsS"),auIndexAtS:c(h=>h>0?Math.max(0,Math.min(l-1,Math.floor(h*u))):0,"auIndexAtS"),auLocation:c(h=>{if(!Number.isInteger(h)||h<0||h>=l)throw new f(`frame ${h} ngoài phạm vi`);return{pos:s.pos+h*o.blockAlign,size:o.blockAlign}},"auLocation"),*iterateAus(h=0,b=l){if(!Number.isInteger(h)||!Number.isInteger(b))throw new f(`WAV iterateAus [${h},${b}) không phải số nguyên`);if(h<0||b>l||b<h)throw new f(`WAV iterateAus [${h},${b}) ngoài [0,${l}]`);for(let m=h;m<b;m++)yield{index:m,pos:s.pos+m*o.blockAlign,size:o.blockAlign,dtsS:m/u}}};return{kind:"wav",durationS:p.durationS,track:p}}finally{$t.closeSync(t)}}c(ln,"inspectWav");import Ut from"node:fs";var It={profile:0,freqIdx:0,sampleRate:0,chanCfg:0,frameLength:0,headerLen:7,samplesPerFrame:1024};function Xr(e,t){if(e.length<7||e[0]!==255||(e[1]&246)!==240)return!1;let n=e[1]&1,r=e[2]>>6&3,o=e[2]>>2&15;if(o>=Ct.length)return!1;let s=(e[2]&1)<<2|e[3]>>6&3;if(s===0||s>7)return!1;let i=(e[3]&3)<<11|e[4]<<3|e[5]>>5&7,a=n?7:9;if(i<a||i>8191)return!1;let l=(e[6]&3)+1;return t.profile=r,t.freqIdx=o,t.sampleRate=Ct[o],t.chanCfg=s,t.frameLength=i,t.headerLen=a,t.samplesPerFrame=l*1024,!0}c(Xr,"parseAdtsHeaderInto");function un(e){let t=Ut.openSync(e,"r");try{let n=Ut.fstatSync(t).size,r=0,o=Buffer.alloc(10);if(Ut.readSync(t,o,0,10,0)>=10&&o.toString("latin1",0,3)==="ID3"){for(let w=6;w<=9;w++)if(o[w]&128)throw new f("AAC: ID3 syncsafe size hỏng");if(r=10+((o[6]&127)<<21|(o[7]&127)<<14|(o[8]&127)<<7|o[9]&127)+(o[5]&16?10:0),!(r>=10&&r<=n))throw new f(`AAC: ID3 tag vượt EOF (${r} > ${n})`)}let i=1<<20,a=Buffer.allocUnsafe(i),l=-1,u=-1,p=c(v=>{let w=Math.max(0,Math.min(v,Math.max(0,n-1))),N=Math.min(n,w+i),O=0;for(;O<N-w;){let B=Ut.readSync(t,a,O,N-w-O,w+O);if(B<=0)break;O+=B}l=w,u=w+O},"loadWin"),h=c(v=>v<0||v+7>n||(v<l||v+7>u)&&(p(v),v<l||v+7>u)?null:a.subarray(v-l,v-l+7),"readAt"),b=[],m=0,g=r,A=0,E=!1,C=0,x=0,S=0,d=4,y=2,$=2;for(;;){let v=h(r);if(v===null)break;if(!Xr(v,It))throw new f(`AAC ADTS: sync word hỏng tại offset ${r} — NO-FALLBACK`);let w=It.frameLength,N=It.samplesPerFrame,O=It.sampleRate;if(r+w>n)break;E||(d=It.freqIdx,y=It.chanCfg,$=It.profile+1),E&&C===w&&x===N&&S===O||(E&&m>0&&b.push({start:A,frames:m-A,size:C,samplesPerFrame:x,sampleRate:S,startPos:g}),g=r,A=m,C=w,x=N,S=O,E=!0),m+=1,r+=w}E&&m>0&&b.push({start:A,frames:m-A,size:C,samplesPerFrame:x,sampleRate:S,startPos:g});let _=0,P=0;for(let v of b)v.startAbs=_,v.startSec=P,_+=v.frames,P+=v.frames*v.samplesPerFrame/v.sampleRate;if(_===0)throw new f("AAC ADTS: không tìm thấy frame hợp lệ");let k=_,M=0,I=c(v=>{let w=b[M];if(w&&v>=w.startAbs&&v<w.startAbs+w.frames)return w;let N=b[M+1];if(N&&v>=N.startAbs&&v<N.startAbs+N.frames)return M+=1,N;let O=0,B=b.length-1;for(;O<=B;){let z=O+B>>1;v<b[z].startAbs?B=z-1:O=z+1}return M=B>=0?B:0,b[M]},"runFor"),R={codec:"aac",audioObjectType:$,freqIdx:d,chanCfg:y,sampleRate:b[0].sampleRate,auCount:k,durationS:P,auDtsS:c(v=>{if(!Number.isInteger(v)||v<0||v>=k)throw new f(`frame ${v} ngoài phạm vi`);let w=I(v);return w.startSec+(v-w.startAbs)*w.samplesPerFrame/w.sampleRate},"auDtsS"),auIndexAtS:c(v=>{if(!(v>0))return 0;let w=0,N=b.length-1,O=b.length-1;for(;w<=N;){let z=w+N>>1,J=b[z],H=J.frames*J.samplesPerFrame/J.sampleRate;v<J.startSec+H?(O=z,N=z-1):w=z+1}let B=b[O];return Math.min(k-1,B.startAbs+Math.floor((v-B.startSec)*B.sampleRate/B.samplesPerFrame))},"auIndexAtS"),auLocation:c(v=>{if(!Number.isInteger(v)||v<0||v>=k)throw new f(`frame ${v} ngoài phạm vi`);let w=I(v);return{pos:w.startPos+(v-w.startAbs)*w.size,size:w.size}},"auLocation"),*iterateAus(v=0,w=k){if(!Number.isInteger(v)||!Number.isInteger(w))throw new f(`AAC iterateAus [${v},${w}) không phải số nguyên`);if(v<0||w>k||w<v)throw new f(`AAC iterateAus [${v},${w}) ngoài [0,${k}]`);for(let N=v;N<w;N++){let O=R.auLocation(N);yield{index:N,...O,dtsS:R.auDtsS(N)}}}};return{kind:"aac",durationS:R.durationS,track:R}}finally{Ut.closeSync(t)}}c(un,"inspectAac");var Qr=new Set(["ftyp","moov","mdat","free","skip","wide","pnot","uuid"]),Zr=new Set(["styp","moof","sidx","emsg","prft"]);function zt(e){let t;try{t=ne.openSync(e,"r")}catch(a){throw new f(`Không mở được file: ${e} (${a?.code??a?.message??a})`,{cause:a})}let n,r=0;try{if(n=Buffer.alloc(16),r=ne.readSync(t,n,0,16,0),r<=0)throw new f(`File rỗng: ${e}`)}finally{ne.closeSync(t)}if(r>=4&&n.toString("latin1",0,4)==="RF64")throw new f("RF64 (>4GB WAV) chưa hỗ trợ — dùng MP4/M4A chứa AAC — NO-FALLBACK");let o=r>=8?n.toString("latin1",4,8):"";if(Zr.has(o))throw new f(`MP4 phân mảnh (top-level '${o}') — thiếu moov, cần file MP4/MOV/M4A progressive — NO-FALLBACK`);let s;if(Qr.has(o)){let a=r>=4?n.readUInt32BE(0):0;if(!(a===0||a===1||a>=8)){let l=Math.max(0,Math.min(8,r));throw new f(`Định dạng không nhận diện được (magic ${n.subarray(0,l).toString("hex")||"rỗng"}). Hỗ trợ: MP4/MOV/M4A (AAC/MP3), MP3, AAC, WAV — NO-FALLBACK`)}try{s=rn(e)}catch(l){throw l instanceof f?l:new f(`MP4 hỏng: ${l?.message??l}`,{cause:l})}}else if(n.toString("latin1",0,4)==="RIFF"&&n.toString("latin1",8,12)==="WAVE")try{s=ln(e)}catch(a){throw a instanceof f?a:new f(`WAV hỏng: ${a?.message??a}`,{cause:a})}else if(n.toString("latin1",0,3)==="ID3"||r>=2&&n[0]===255&&(n[1]&224)===224)if(r>=2&&n[0]===255&&(n[1]&246)===240&&(n[1]&6)===0&&n.toString("latin1",0,3)!=="ID3")try{s=un(e)}catch(l){throw l instanceof f?l:new f(`AAC hỏng: ${l?.message??l}`,{cause:l})}else try{s=an(e)}catch(l){throw l instanceof f?l:new f(`MP3 hỏng: ${l?.message??l}`,{cause:l})}else{let a=Math.max(0,Math.min(8,r));throw new f(`Định dạng không nhận diện được (magic ${n.subarray(0,a).toString("hex")||"rỗng"}). Hỗ trợ: MP4/MOV/M4A (AAC/MP3), MP3, AAC, WAV — NO-FALLBACK`)}let i;try{i=ne.statSync(e).size}catch(a){throw new f(`Không stat được file: ${e} (${a?.code??a?.message??a})`,{cause:a})}return{...s,path:e,fileSize:i}}c(zt,"inspectMedia");var Pt=class{static{c(this,"CancelToken")}#t=!1;#e=new Set;cancel(){if(this.#t)return;this.#t=!0;let t=[...this.#e];this.#e.clear();for(let n of t)try{n()}catch{}}reset(){this.#t=!1,this.#e.clear()}onCancel(t){if(typeof t!="function")return()=>{};if(this.#t){try{t()}catch{}return()=>{}}return this.#e.add(t),()=>{this.#e.delete(t)}}bind(t){if(!t||typeof t.addEventListener!="function")return t?.aborted&&this.cancel(),()=>{};if(t.aborted)return this.cancel(),()=>{};let n=c(()=>this.cancel(),"onAbort");return t.addEventListener("abort",n,{once:!0}),()=>{try{t.removeEventListener("abort",n)}catch{}}}get cancelled(){return this.#t}check(){if(this.#t)throw new ot("Đã hủy theo yêu cầu")}};import fn from"node:path";var _t=.5,Nt=1.5,mt=1,to=/^[+-]?(\d+\.?\d*|\.\d+)$/;function gt(e=mt){if(e==null)return mt;let t;if(typeof e=="number")t=e;else if(typeof e=="string"){let r=e.trim().replace(/[x×]$/i,"").trim();if(!r||!to.test(r))throw new f(`Tốc độ video không hợp lệ: ${JSON.stringify(e)} (cần ${_t}x – ${Nt}x)`);t=Number(r)}else throw new f(`Tốc độ video không hợp lệ: ${JSON.stringify(e)} (cần ${_t}x – ${Nt}x)`);if(!Number.isFinite(t)||t<_t-1e-9||t>Nt+1e-9)throw new f(`Tốc độ video phải nằm trong khoảng ${_t}x – ${Nt}x (nhận: ${e})`);let n=Math.min(Nt,Math.max(_t,t));return Math.round(n*1e6)/1e6}c(gt,"normalizeSpeed");function dn(e,t,n){if(!Number.isFinite(e)||!Number.isFinite(t))throw new TypeError(`${n}: start/end must be finite numbers (got ${e}, ${t})`)}c(dn,"assertFinite");function hn(e,t){let n=String(e??"").trim();if(!n)throw new TypeError(`${t}: text must be non-empty after trim`);return n}c(hn,"cleanText");function Ce({start:e,end:t,text:n,probability:r=null}){return dn(e,t,"Word"),Object.freeze({start:e,end:t,text:hn(n,"Word"),probability:r})}c(Ce,"Word");function bt({start:e,end:t,text:n,words:r=[],rawStartMs:o=null,rawEndMs:s=null}){return dn(e,t,"Segment"),Object.freeze({start:e,end:t,text:hn(n,"Segment"),words:Object.freeze([...r??[]]),rawStartMs:o,rawEndMs:s})}c(bt,"Segment");function re({index:e,start:t,end:n,coreStart:r,coreEnd:o,path:s,crcHex:i=null,bytes:a=0}){return Object.freeze({index:e,start:t,end:n,coreStart:r,coreEnd:o,path:s,crcHex:i,bytes:a})}c(re,"Chunk");function Re({inputPath:e,outputPath:t,model:n="JianYing ORIGINAL 1:1 · client 10.9",language:r=null,maxChars:o=42,softMaxChars:s=56,mergeGapS:i=1.5,maxDuration:a=7,minDuration:l=5/6,cps:u=20,gapMs:p=84,jianyingAppVersion:h="10.9.0",maxWorkers:b=null,speed:m=mt,formats:g=["srt"],physicalSpeed:A=null,srtOnly:E=!1,noJunk:C=!1}){let x=gt(m);return Object.freeze({inputPath:fn.resolve(String(e)),outputPath:fn.resolve(String(t)),model:n,language:r,maxChars:o,softMaxChars:s,mergeGapS:i,maxDuration:a,minDuration:l,cps:u,gapMs:p,jianyingAppVersion:h,maxWorkers:b,speed:x,formats:Array.isArray(g)?Object.freeze([...g]):Object.freeze(["srt"]),physicalSpeed:A===null?null:!!A,srtOnly:!!(E||C),noJunk:!!(E||C)})}c(Re,"Options");function pn({outputPath:e,segments:t,language:n,languageProbability:r,elapsed:o,speed:s=mt}){return Object.freeze({outputPath:e,segments:Object.freeze([...t]),language:n,languageProbability:r,elapsed:o,speed:gt(s)})}c(pn,"Result");import Tt from"node:fs";import Qo from"node:os";import Ze from"node:path";import Nn from"node:path";import wt from"node:fs";import Be from"node:path";import $e from"node:fs";import*as Pe from"node:zlib";var mn=typeof Pe.crc32=="function"?Pe.crc32:null,oe=null;function eo(){if(oe)return oe;let e=new Uint32Array(256*16);for(let t=0;t<256;t++){let n=t;for(let r=0;r<8;r++)n=n&1?3988292384^n>>>1:n>>>1;e[t]=n>>>0}for(let t=0;t<256;t++)for(let n=1;n<16;n++){let r=e[(n-1)*256+t];e[n*256+t]=(r>>>8^e[r&255])>>>0}return oe=e,e}c(eo,"initSlice16Table");function gn(e){return typeof e=="string"?Buffer.from(e,"utf8"):Buffer.isBuffer(e)?e:ArrayBuffer.isView(e)?Buffer.from(e.buffer,e.byteOffset,e.byteLength):Buffer.from(String(e),"utf8")}c(gn,"toBytes");function no(e,t=0){let n=gn(e),r=oe||eo(),o=(t^-1)>>>0,s=0,i=n.length;for(;s+16<=i;){let a=n[s]^o&255,l=n[s+1]^o>>>8&255,u=n[s+2]^o>>>16&255,p=n[s+3]^o>>>24;o=r[15*256+a]^r[14*256+l]^r[13*256+u]^r[12*256+p]^r[11*256+n[s+4]]^r[10*256+n[s+5]]^r[9*256+n[s+6]]^r[8*256+n[s+7]]^r[7*256+n[s+8]]^r[6*256+n[s+9]]^r[5*256+n[s+10]]^r[4*256+n[s+11]]^r[3*256+n[s+12]]^r[2*256+n[s+13]]^r[1*256+n[s+14]]^r[n[s+15]],s+=16}for(;s<i;)o=(r[(o^n[s])&255]^o>>>8)>>>0,s++;return(o^-1)>>>0}c(no,"fallbackCrc32");function Oe(e,t=0){let n=gn(e);return mn?mn(n,t)>>>0:no(n,t)}c(Oe,"crc32");function wn(e,t=1<<20){let n=$e.openSync(e,"r");try{let r=0,o=Buffer.allocUnsafe(t);for(;;){let s=$e.readSync(n,o,0,t,null);if(s===0)break;r=Oe(o.subarray(0,s),r)}return(r>>>0).toString(16).padStart(8,"0")}finally{$e.closeSync(n)}}c(wn,"crc32FileHex");import Le from"node:os";function ro(){try{if(typeof Le.availableParallelism=="function"){let e=Le.availableParallelism();if(Number.isFinite(e)&&e>0)return Math.trunc(e)}}catch{}return Le.cpus()?.length||4}c(ro,"cpuParallelism");function oo(){let e=ro();return Math.max(4,Math.min(12,e*2))}c(oo,"defaultMaxWorkers");var Sn=/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/,yn=/^[+-]?\d+$/,bn=new Set;function ht(e,t,n){if(!bn.has(e)){bn.add(e);try{console.warn(`[config] env ${e}=${JSON.stringify(t)} invalid — using ${n}`)}catch{}}}c(ht,"warnInvalidEnv");function xn(e,t,n,r,o,s){let i=process.env[e];if(i===void 0)return t<<o;let a=Number.parseInt(String(i).trim(),10);return!Number.isFinite(a)||a<n||a>r?(ht(e,i,`${t}${s} (range ${n}–${r}${s})`),t<<o):a<<o}c(xn,"envBytes");function so(e,t,n,r){return xn(e,t,n,r,20,"MB")}c(so,"envIntMB");function se(e,t){let n=process.env[e];if(n===void 0)return t;let r=String(n).trim();return r||(ht(e,n,`default ${JSON.stringify(t)}`),t)}c(se,"envString");function Fe(e,t,{min:n=0,max:r=Number.POSITIVE_INFINITY}={}){let o=process.env[e];if(o===void 0)return t;let s=String(o).trim().toLowerCase();if(!Sn.test(s))return ht(e,o,String(t)),t;let i=Number(s);return!Number.isFinite(i)||i<n||i>r?(ht(e,o,String(t)),t):i}c(Fe,"envPositiveFloat");function ie(e,t,{min:n=1,max:r=Number.MAX_SAFE_INTEGER}={}){let o=process.env[e];if(o===void 0)return t;let s=String(o).trim().toLowerCase();if(!yn.test(s))return ht(e,o,String(t)),t;let i=Number.parseInt(s,10);return!Number.isFinite(i)||i<n||i>r?(ht(e,o,String(t)),t):i}c(ie,"envPositiveInt");function io(e,t){let n=process.env[e];if(n===void 0)return t;let r=n.trim().toLowerCase();return r===""?!1:!["0","false","no","off"].includes(r)}c(io,"envBool");function ae(e,t){let n=process.env[e];if(n===void 0)return t;let r=n.trim().toLowerCase();if(["","none","null","off","0","inf","infinite","forever"].includes(r))return null;if(!Sn.test(r))return ht(e,n,t===null?"null (wait forever)":String(t)),t;let o=Number(r);return Number.isFinite(o)?o<=0?null:o:(ht(e,n,t===null?"null (wait forever)":String(t)),t)}c(ae,"envFloat");function ao(e,t){let n=process.env[e];if(n===void 0)return t;let r=n.trim().toLowerCase();if(["","none","null","off","inf","infinite","forever"].includes(r))return 0;if(!yn.test(r))return ht(e,n,String(t)),t;let o=Number.parseInt(r,10);return o<0?0:o}c(ao,"envInt");function De(e,t){return e==null?t==null?null:[null,t]:[e,t??null]}c(De,"httpTimeout");var U=Object.freeze({CHUNK_CORE_S:480,OVERLAP_S:8,SILENCE_WINDOW:55,SILENCE_NOISE_DB:-38,SILENCE_MIN_D:.4,SILENCE_DETECT:io("ASR_SILENCE",!0),SPAN_BYTES:so("ASR_SPAN_MB",8,1,64),OUT_BUF_BYTES:xn("ASR_OUTBUF_KB",256,64,4096,10,"KB"),UPLOAD_HWM_BYTES:1<<20,POOL_SIZE:ie("ASR_POOL_SIZE",1024,{min:32,max:8192}),JY_CONNECT_TO:ae("ASR_JY_CONNECT",null),JY_POLL_READ_TO:ae("ASR_JY_POLL_READ",null),JY_LONG_READ_TO:ae("ASR_JY_LONG_READ",null),JY_UPLOAD_READ_TO:ae("ASR_JY_UPLOAD_READ",null),JY_POLL_MIN_S:Fe("ASR_JY_POLL_MIN_S",.35,{min:.01,max:60}),JY_POLL_MAX_S:Fe("ASR_JY_POLL_MAX_S",1.5,{min:.01,max:60}),JY_POLL_MAX_ATTEMPTS:ao("ASR_JY_POLL_ATTEMPTS",0),JY_APPVR:se("ASR_JY_APPVR","10.9.0"),JY_CAPTION_TYPE:ie("ASR_JY_CAPTION_TYPE",2,{min:1,max:10}),JY_WORDS_PER_LINE:ie("ASR_JY_WORDS_PER_LINE",16,{min:1,max:100}),JY_ADJUST_ENDTIME:ie("ASR_JY_ADJUST_ENDTIME",200,{min:0,max:1e4}),JY_BASE:se("ASR_JY_BASE","https://lv-pc-api-sinfonlinec.ulikecam.com"),JY_SIGN_UA:se("ASR_JY_SIGN_UA","Cronet/TTNetVersion:d4572e53 2024-06-12 QuicVersion:4bf243e0 2023-04-17"),JY_UPLOAD_UA:se("ASR_JY_UPLOAD_UA","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Thea/1.0.1"),AUDIO_CHANNELS:1,AUDIO_SAMPLE_RATE:16e3,AUDIO_BITRATE:"64k",CIRCUIT_FAILS:8,CIRCUIT_RESET_S:45,RATE_RPS:Fe("ASR_RATE_RPS",100,{min:1,max:1e3}),jyTimeout(e="poll"){return e==="upload"?De(this.JY_CONNECT_TO,this.JY_UPLOAD_READ_TO):e==="long"?De(this.JY_CONNECT_TO,this.JY_LONG_READ_TO):De(this.JY_CONNECT_TO,this.JY_POLL_READ_TO)},maxWorkers(e=null){if(e!=null){let n=Math.trunc(Number(e));if(Number.isFinite(n)&&n>0)return Math.min(n,16);ht("maxWorkers(override)",e,"auto")}let t=process.env.ASR_MAX_WORKERS;if(t!==void 0){let n=Number.parseInt(String(t).trim(),10);if(Number.isFinite(n)&&n>0)return Math.min(n,16);ht("ASR_MAX_WORKERS",t,"auto")}return oo()}});var Ot=U.SPAN_BYTES,ce=U.OUT_BUF_BYTES,je=class{static{c(this,"OutputWriter")}#t;#e;#n=0;#r=0;size=0;constructor(t){wt.mkdirSync(Be.dirname(String(t)),{recursive:!0}),this.#t=wt.openSync(t,"w"),this.#e=Buffer.allocUnsafe(ce)}push(t){if(t.length>=ce){this.#i(),this.#o(t);return}this.#n+t.length>ce&&this.#i(),t.copy(this.#e,this.#n),this.#n+=t.length}pushAdtsHeader(t,n,r,o){if(!Number.isInteger(t)||t<0||t>12)throw new f(`ADTS freqIdx ${t} ngoài [0,12]`);if(!Number.isInteger(n)||n<1||n>7)throw new f(`ADTS chanCfg ${n} ngoài [1,7]`);if(!Number.isInteger(r)||r<0||r>3)throw new f(`ADTS profile ${r} ngoài [0,3]`);let s=o+7;if(s>8191)throw new f(`AU ${o}B vượt ADTS frame limit`);this.#n+7>ce&&this.#i();let i=this.#e,a=this.#n;i[a]=255,i[a+1]=241,i[a+2]=r<<6|t<<2|n>>2&1,i[a+3]=(n&3)<<6|s>>11&3,i[a+4]=s>>3&255,i[a+5]=(s&7)<<5|31,i[a+6]=252,this.#n+=7}#i(){this.#n!==0&&(this.#o(this.#e.subarray(0,this.#n)),this.#n=0)}#o(t){let n=0;for(;n<t.length;){let r=wt.writeSync(this.#t,t,n,t.length-n,null);if(!(r>0))throw new f(`cut: ghi hụt tại offset ${n}/${t.length}`);n+=r}this.#r=Oe(t,this.#r),this.size+=t.length}finish(){return this.#i(),wt.closeSync(this.#t),this.#t=-1,{size:this.size,crcHex:(this.#r>>>0).toString(16).padStart(8,"0")}}abort(){try{this.#t!==-1&&wt.closeSync(this.#t)}catch{}this.#t=-1}};async function Ue(e,t,{token:n=null,onDone:r=null}={}){if(!Array.isArray(t)||t.length===0)return[];let o=e?.track;if(!o||!Number.isInteger(o.auCount)||o.auCount<=0)throw new f("cut: meta.track thiếu hoặc auCount vô lý");if(typeof o.auLocation!="function")throw new f("cut: track.auLocation thiếu");let s=new Set(["adts","raw","wav"]),i=new Set,a=e.fileSize;for(let u of t){if(!Number.isInteger(u.fromAu)||!Number.isInteger(u.toAuExcl)||u.fromAu<0||u.toAuExcl<=u.fromAu)throw new f(`cut: range [${u.fromAu},${u.toAuExcl}) không hợp lệ`);if(u.fromAu>=o.auCount)throw new f(`cut: range [${u.fromAu},${u.toAuExcl}) ngoài [0,${o.auCount})`);if(u.toAuExcl>o.auCount)throw new f(`cut: range [${u.fromAu},${u.toAuExcl}) vượt auCount ${o.auCount}`);if(!s.has(u.wrap))throw new f(`cut: wrap '${u.wrap}' không hỗ trợ (cần adts/raw/wav)`);if(typeof u.outPath!="string"||u.outPath.length===0)throw new f("cut: outPath thiếu");let p=Be.resolve(String(u.outPath));if(i.has(p))throw new f(`cut: outPath trùng lặp ${u.outPath}`);if(i.add(p),p===Be.resolve(String(e.path)))throw new f("cut: outPath trùng source — từ chối self-overwrite")}for(let u of t)if(u.wrap==="adts"){if(e.kind!=="mp4-aac"&&e.kind!=="aac"||o.codec!=="aac")throw new f(`cut: wrap adts cần track AAC (nhận kind ${e.kind})`);if(Te(o.audioObjectType),!Number.isInteger(o.freqIdx)||!Number.isInteger(o.chanCfg))throw new f("cut: track AAC thiếu freqIdx/chanCfg cho ADTS")}else if(u.wrap==="wav"){if(e.kind!=="wav"||o.codec!=="pcm")throw new f(`cut: wrap wav cần track PCM (nhận kind ${e.kind})`);if(!o.channels||!o.sampleRate||!o.bits)throw new f("cut: track PCM thiếu channels/sampleRate/bits cho WAV")}let l=wt.openSync(e.path,"r");try{try{a=wt.fstatSync(l).size}catch{}let u=Buffer.allocUnsafe(Ot),p=-1,h=-1,b=c(k=>{let M=Math.max(0,Math.min(k,a-1)),I=Math.min(a,M+Ot);if(I<=M)throw new f(`cut: span rỗng tại ${M}`);let R=0;for(;R<I-M;){let v=wt.readSync(l,u,R,I-M-R,M+R);if(v<=0)throw new f(`cut: đọc hụt tại ${M+R}`);R+=v}p=M,h=I},"loadSpan"),m=c((k,M)=>{if(M>Ot)throw new f(`cut: run ${M}B vượt span`);return(k<p||k+M>h)&&b(k),u.subarray(k-p,k-p+M)},"viewAt"),g=t.map((k,M)=>({r:k,i:M})).sort((k,M)=>k.r.fromAu-M.r.fromAu||k.r.toAuExcl-M.r.toAuExcl),A=new Array(t.length),E=new Set;for(let{r:k}of g)E.add(Math.min(k.fromAu,o.auCount)),E.add(Math.min(k.toAuExcl,o.auCount));let C=[...E].sort((k,M)=>k-M).filter(k=>k>=0&&k<o.auCount),x=new Map,S=64,d=0,y=0,$=c(k=>{for(;d<g.length&&g[d].r.fromAu<=k;){if(x.size>=S)throw new f(`cut: quá nhiều cửa sổ đồng thời (>${S}) — chia batch`);let{r:M}=g[d],I=new je(M.outPath),R;if(M.wrap==="adts"){let v=e.track;R={kind:"adts",profile:Te(v.audioObjectType),freqIdx:v.freqIdx,chanCfg:v.chanCfg}}else if(M.wrap==="wav"){let v=e.track,w=Math.min(M.toAuExcl,o.auCount),N=v.auLocation(M.fromAu).size;R={kind:"wav",header:cn((w-M.fromAu)*N,v.channels,v.sampleRate,v.bits,v.audioFormat??1)},I.push(R.header)}else R={kind:"raw"};x.set(d,{writer:I,wrap:R,fromAu:M.fromAu,toAu:Math.min(M.toAuExcl,o.auCount)}),d+=1}},"activateUpTo"),_=new Uint32Array(4096),P=c(k=>{if(k<=_.length)return;let M=_.length;for(;M<k;)M*=2;let I=new Uint32Array(M);I.set(_),_=I},"ensureOffsetsCap");try{for(let k=0;k<C.length;k++){let M=C[k],I=C[k+1]??o.auCount;if(M>=I)continue;for(let[v,w]of[...x])M>=w.toAu&&(A[g[v].i]={path:g[v].r.outPath,...w.writer.finish()},x.delete(v),y+=1,r?.(y,t.length));if($(M),x.size===0)continue;let R=M;for(;R<I;){let v=o.auLocation(R),w=v.pos,N=v.size,O,B,z=!1;if(o.contiguous&&N>0){let H=Math.max(1,Math.floor(Ot/N));O=Math.min(I,R+H),B=w+(O-R)*N}else{O=R+1,B=w+N,_[0]=0,_[1]=N;let H=1;for(;O<I&&B-w<Ot;){let K=o.auLocation(O);if(K.pos!==B||B+K.size-w>Ot)break;H+=1,P(H+1),B+=K.size,_[H]=B-w,O+=1}z=!0}let J=m(w,B-w);for(let[,H]of x){let K=Math.max(H.fromAu,R),D=Math.min(H.toAu,O);if(!(K>=D))if(H.wrap.kind==="adts")if(z)for(let T=K;T<D;T++){let L=T-R,F=_[L],j=_[L+1];H.writer.pushAdtsHeader(H.wrap.freqIdx,H.wrap.chanCfg,H.wrap.profile,j-F),H.writer.push(J.subarray(F,j))}else for(let T=K;T<D;T++){let L=(T-R)*N;H.writer.pushAdtsHeader(H.wrap.freqIdx,H.wrap.chanCfg,H.wrap.profile,N),H.writer.push(J.subarray(L,L+N))}else if(z){let T=_[K-R],L=_[D-R];H.writer.push(J.subarray(T,L))}else{let T=(K-R)*N,L=(D-R)*N;H.writer.push(J.subarray(T,L))}}R=O,n?.check()}n?.check()}for(let[k,M]of[...x])A[g[k].i]={path:g[k].r.outPath,...M.writer.finish()},x.delete(k),y+=1,r?.(y,t.length);if(A.some(k=>!k))throw new f("cut: có khoảng chưa đóng — bảng sample ngắn hơn dự kiến");return A}catch(k){for(let[,M]of[...x])try{M.writer.abort?.()}catch{}for(let{r:M}of g)try{wt.rmSync(M.outPath,{force:!0})}catch{}throw k}}finally{wt.closeSync(l)}}c(Ue,"cutUnits");function vn(e,t,n,r,o,s=null){let i=s??U.OVERLAP_S;if(!(n>0&&Number.isFinite(n)))throw new f("planOverlap: duration invalid");if(!Number.isInteger(r)||!Number.isInteger(o)||r<0||r>=o)throw new f("planOverlap: index/count invalid");if(!(e>=0&&t>=e&&t<=n))throw new f("planOverlap: core window invalid");if(!(i>=0&&Number.isFinite(i)))throw new f("planOverlap: overlap invalid");let a=Math.max(0,e-(r?i:0)),l=Math.min(n,t+(r<o-1?i:0));return[a,l]}c(vn,"planOverlap");import{spawn as fo}from"node:child_process";import{spawn as co,spawnSync as lo}from"node:child_process";import Jt from"node:fs";import An from"node:os";import ze from"node:path";var Lt;function le(){if(Lt!==void 0)return Lt;if(process.env.FFMPEG_PATH&&Jt.existsSync(process.env.FFMPEG_PATH))return Lt=process.env.FFMPEG_PATH;try{if(lo("ffmpeg",["-version"],{stdio:"ignore",windowsHide:!0}).status===0)return Lt="ffmpeg"}catch{}let e=["C:\\ffmpeg\\bin\\ffmpeg.exe","C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe","C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",ze.join(An.homedir(),"ffmpeg","bin","ffmpeg.exe"),ze.join(An.homedir(),"AppData","Local","Microsoft","WinGet","Links","ffmpeg.exe"),"D:\\ffmpeg\\bin\\ffmpeg.exe"];for(let t of e)try{if(Jt.existsSync(t))return Lt=t}catch{}return Lt=null}c(le,"getFfmpegPath");function En(){return le()!==null}c(En,"isFfmpegAvailable");function uo(e){if(e>=.5&&e<=2)return`atempo=${e.toFixed(4)}`;let t=[],n=e;for(;n<.5;)t.push("atempo=0.5"),n/=.5;for(;n>2;)t.push("atempo=2.0"),n/=2;return t.push(`atempo=${n.toFixed(4)}`),t.join(",")}c(uo,"buildAtempoFilter");async function Mn(e,t,n=.8,{token:r=null,sampleRate:o=16e3}={}){let s=gt(n);if(Math.abs(s-1)<1e-6)return e!==t&&Jt.copyFileSync(e,t),t;let i=le();if(!i)throw new f(`Không tìm thấy FFmpeg để chuyển đổi âm thanh chuẩn ${s}x. Vui lòng cài đặt FFmpeg hoặc cấu hình biến FFMPEG_PATH.`);let a=uo(s),l=ze.extname(t).toLowerCase(),b=["-nostdin","-y","-i",e,"-vn","-filter:a",a,...l===".wav"?["-c:a","pcm_s16le"]:l===".aac"||l===".m4a"?["-c:a","aac","-b:a","128k"]:["-c:a","libmp3lame","-q:a","2"],"-ar",String(o),"-ac","1",t];return new Promise((m,g)=>{let A;try{A=co(i,b,{stdio:["ignore","pipe","pipe"],windowsHide:!0})}catch(x){return g(new f(`Không thể khởi chạy FFmpeg: ${x.message}`,{cause:x}))}let E="";A.stderr.on("data",x=>{E+=x.toString()});let C=c(()=>{try{A.kill("SIGKILL")}catch{}},"onCancel");if(r){if(r.cancelled)return C(),g(new f("Chuyển đổi âm thanh bị hủy bởi người dùng"));r.onCancel?.(C)}A.on("close",x=>{x===0&&Jt.existsSync(t)&&Jt.statSync(t).size>0?m(t):r?.cancelled?g(new f("Chuyển đổi âm thanh bị hủy bởi người dùng")):g(new f(`Chuyển đổi âm thanh ${s}x thất bại (mã ${x}): ${E.slice(-300)||"không rõ nguyên nhân"}`))}),A.on("error",x=>{g(new f(`Lỗi tiến trình FFmpeg: ${x.message}`,{cause:x}))})})}c(Mn,"convertAudioSpeed");async function ho(e,{noiseDb:t=U.SILENCE_NOISE_DB,minDuration:n=U.SILENCE_MIN_D,token:r=null}={}){let o=le();return!o||!e?[]:new Promise(s=>{let i=["-nostdin","-i",e,"-af",`silencedetect=noise=${t}dB:d=${n}`,"-f","null","-"],a;try{a=fo(o,i,{stdio:["ignore","ignore","pipe"],windowsHide:!0})}catch{return s([])}let l="";a.stderr.on("data",p=>{l+=p.toString()});let u=c(()=>{try{a.kill("SIGKILL")}catch{}},"onCancel");if(r){if(r.cancelled)return u(),s([]);r.onCancel?.(u)}a.on("close",p=>{let h=[],b=l.split(/\r?\n/),m=null;for(let g of b){let A=/silence_start:\s*([0-9.]+)/.exec(g);if(A){m=Number(A[1]);continue}let E=/silence_end:\s*([0-9.]+)/.exec(g);if(E&&m!==null){let C=Number(E[1]);C>m&&Number.isFinite(C)&&Number.isFinite(m)&&h.push(Math.round((m+C)/2*1e3)/1e3),m=null}}h.sort((g,A)=>g-A),s(h)}),a.on("error",()=>s([]))})}c(ho,"detectSilenceWithFfmpeg");async function po(e,{token:t=null}={}){if(!e||typeof e!="object")throw new f("silence: meta thiếu");let n=e.track;if(!n)throw new f("silence: meta.track thiếu");if(n.bits!==16)throw new f(`ASR_SILENCE chỉ hỗ trợ PCM 16-bit (nhận ${n.bits}-bit).`);if(!Number.isInteger(n.channels)||n.channels<1||n.channels>64)throw new f(`silence: channels ${n.channels} ngoài [1,64]`);if(!(n.sampleRate>0&&Number.isFinite(n.sampleRate)))throw new f(`silence: sampleRate ${n.sampleRate} vô lý`);if(!Number.isInteger(n.auCount)||n.auCount<=0)throw new f("silence: auCount vô lý");if(typeof n.auLocation!="function")throw new f("silence: track.auLocation thiếu");let r=await import("node:fs"),o=r.openSync(e.path,"r");try{let i=Math.max(1,Math.round(n.sampleRate*.03))*n.channels*2,l=Math.max(1,Math.floor((1<<20)/i))*i,u=Buffer.allocUnsafe(l),p=Math.pow(10,U.SILENCE_NOISE_DB/20)*32767,h=n.auLocation(0).pos,b=n.blockAlign??n.channels*2,m=h+n.auCount*b,g=0,A=null,E=[],C=c((S,d)=>{let y=Math.floor(d/2),$=0;for(let k=0;k<y;k++){let M=S+k*2,I=u[M]|u[M+1]<<8;I&32768&&(I-=65536),$+=I*I}let P=Math.sqrt($/Math.max(1,y))<p;P&&A===null&&(A=g),!P&&A!==null&&(g-A>=U.SILENCE_MIN_D&&E.push((A+g)/2),A=null),g+=y/n.channels/n.sampleRate},"processWindow"),x=0;for(;h<m;){let S=Math.min(l,m-h),d=0;for(;d<S;){let $=r.readSync(o,u,d,S-d,h+d);if($<=0)throw new f("WAV đọc hụt khi quét silence");d+=$}let y=0;for(;y<S;){let $=Math.min(i,S-y);C(y,$),y+=$,x+=1,t&&(x&255)===0&&t.check()}h+=S,t?.check()}return A!==null&&g-A>=U.SILENCE_MIN_D&&E.push((A+g)/2),E}finally{r.closeSync(o)}}c(po,"detectWavSilenceRMS");async function In(e,{token:t=null}={}){if(!U.SILENCE_DETECT)return[];if(!e||typeof e!="object")throw new f("silence: meta thiếu");if(e.path)try{let n=await ho(e.path,{noiseDb:U.SILENCE_NOISE_DB,minDuration:U.SILENCE_MIN_D,token:t});if(Array.isArray(n)&&n.length>0)return n}catch{}return e.kind==="wav"?po(e,{token:t}):[]}c(In,"detectSilenceMidpoints");function _n(e,t,n=null,r=null){let o=n??U.CHUNK_CORE_S,s=r??U.SILENCE_WINDOW;if(!(e>0&&Number.isFinite(e)))throw new f("duration must be positive finite");if(!(o>0&&Number.isFinite(o)))throw new f("chunk must be positive finite");if(!(s>=0&&Number.isFinite(s)))throw new f("window must be finite non-negative");if(!Array.isArray(t))throw new f("silences phải là mảng số giây");for(let p=0;p<t.length;p++){let h=t[p];if(!(typeof h=="number"&&Number.isFinite(h)&&h>=0&&h<=e))throw new f(`silences[${p}]=${h} ngoài [0,${e}]`);if(p>0&&!(h>=t[p-1]))throw new f(`silences không sắp xếp tại [${p-1},${p}] (${t[p-1]} > ${h})`)}let i=[0],a=o,l=.5,u=.2;for(;a<e;){let p=i[i.length-1]+o*l,h=t.filter(m=>m>=p&&m<e&&Math.abs(m-a)<=s);h.length===0&&t.length>0&&(h=t.filter(m=>m>=p&&m<e&&Math.abs(m-a)<=s*1.5));let b;h.length>0?b=h.reduce((m,g)=>Math.abs(g-a)<Math.abs(m-a)?g:m):b=a,b<=i[i.length-1]+o*u&&(b=Math.min(e,i[i.length-1]+o)),i.push(b),a=b+o}if(i.push(e),i.length>2){let p=e-i[i.length-2],h=Math.min(o*.1,s*.5);p<h&&i.splice(i.length-2,1)}return i}c(_n,"boundaries");var ue=Number.MAX_SAFE_INTEGER,Je=class e{static{c(this,"MetricsRegistry")}#t=new Map;#e=new Map;incr(t,n=1){if(!Number.isFinite(n)||n===0)return;let r=(this.#t.get(t)??0)+n;this.#t.set(t,Number.isFinite(r)?Math.min(r,ue):ue)}addTimeMs(t,n){if(!Number.isFinite(n)||n<=0)return;let r=(this.#e.get(t)??0)+n;this.#e.set(t,Number.isFinite(r)?Math.min(r,ue):ue)}async time(t,n){let r=performance.now();try{return await n()}finally{this.addTimeMs(t,performance.now()-r)}}reset(){this.#t.clear(),this.#e.clear()}fork(){let t=new e;for(let[n,r]of this.#t)t.#t.set(n,r);for(let[n,r]of this.#e)t.#e.set(n,r);return t}snapshot(){return{counters:Object.fromEntries(this.#t),timers_ms:Object.fromEntries(this.#e)}}snapshotDelta(t){let n=t?.counters??{},r=t?.timers_ms??{},o={};for(let[i,a]of this.#t)o[i]=a-(n[i]??0);let s={};for(let[i,a]of this.#e)s[i]=a-(r[i]??0);return{counters:o,timers_ms:s}}},q=new Je;var kn=new Map([["mp4-aac","aac"],["mp4-mp3","mp3"],["mp3","mp3"],["aac","aac"],["wav","wav"]]),Tn=new Map([["mp4-aac","adts"],["mp4-mp3","raw"],["mp3","raw"],["aac","raw"],["wav","wav"]]),fe=class{static{c(this,"AdaptiveChunker")}#t;#e;constructor(t,n=()=>{}){this.#t=t,this.#e=n}async split(t,n){let r=this.#t,o=this.#e;if(!t||typeof t!="object")throw new f("chunker: meta thiếu");let s=t.track;if(!s||!Number.isInteger(s.auCount)||s.auCount<=0)throw new f("chunker: meta.track thiếu hoặc auCount vô lý");if(!(t.durationS>0&&Number.isFinite(t.durationS)))throw new f("chunker: meta.durationS vô lý");if(typeof s.auIndexAtS!="function"||typeof s.auCount!="number")throw new f("chunker: track thiếu accessor auIndexAtS/auCount");r.check();let i;U.SILENCE_DETECT?(o(12,"Quét silence & khoảng lặng giọng nói (VAD đa ngôn ngữ)…"),i=await q.time("silence_scan_ms",()=>In(t,{token:r})),i.length>0&&o(13,`Tìm thấy ${i.length} điểm lặng âm thanh · lên lịch cắt tại vùng không có voice…`)):(o(12,"Turbo cut · mốc cố định (bỏ silence)…"),i=[]);let a=t.durationS,l=_n(a,i);{let x=Math.min(U.CHUNK_CORE_S*.1,U.SILENCE_WINDOW*.5);l.length>2&&a-l[l.length-2]<x&&(l=[...l.slice(0,-2),a])}let u=Math.max(1,l.length-1),p=Tn.get(t.kind);if(!p)throw new f(`chunker: kind ${t.kind} chưa hỗ trợ wrap`);let h=kn.get(t.kind);if(!h)throw new f(`chunker: kind ${t.kind} thiếu ext`);let b=[],m=[],g=1e-9,A=typeof s.auDtsS=="function";for(let x=0;x<u;x++){let[S,d]=[l[x],l[x+1]],y=x>0&&i.some(w=>Math.abs(w-S)<.15),$=x<u-1&&i.some(w=>Math.abs(w-d)<.15),_,P;y&&$?(_=S,P=d):y?(_=S,P=Math.min(a,d+(x<u-1?U.OVERLAP_S:0))):$?(_=Math.max(0,S-(x?U.OVERLAP_S:0)),P=d):[_,P]=vn(S,d,a,x,u);let k=s.auIndexAtS(_),M=P>=a-g?s.auCount:Math.min(s.auCount,Math.max(k+1,s.auIndexAtS(P))),I=A&&k>0?s.auDtsS(k):_,R=A&&M<s.auCount?Math.max(I+1e-6,s.auDtsS(M)):P,v=Nn.join(String(n),`chunk-${String(x+1).padStart(4,"0")}.${h}`);b.push({fromAu:k,toAuExcl:M,outPath:v,wrap:p}),m.push(re({index:x,start:I,end:R,coreStart:S,coreEnd:d,path:v}))}o(14,`Cắt ${u} đoạn passthrough · thuần NodeJS · 1 lượt đọc duy nhất`);let E=performance.now(),C=await q.time("split_passthrough_ms",()=>Ue(t,b,{token:r,onDone:c((x,S)=>{o(14+Math.round(12*x/Math.max(1,S)),`Đoạn ${x}/${S} · byte-surgery ${performance.now()-E|0}ms`)},"onDone")}));for(let x=0;x<m.length;x++)m[x]=re({...m[x],crcHex:C[x].crcHex,bytes:C[x].size});return q.incr("chunks_split",u),o(26,`Tách xong ${u} đoạn · passthrough gốc, không re-encode`),m}async singleOriginal(t,n){if(this.#t.check(),!t||typeof t!="object")throw new f("chunker: meta thiếu");if(!t.track||!Number.isInteger(t.track.auCount)||t.track.auCount<=0)throw new f("chunker: meta.track thiếu hoặc auCount vô lý");if(!(t.durationS>0&&Number.isFinite(t.durationS)))throw new f("chunker: meta.durationS vô lý");let r=kn.get(t.kind);if(!r)throw new f(`chunker: kind ${t.kind} thiếu ext`);let o=Tn.get(t.kind);if(!o)throw new f(`chunker: kind ${t.kind} chưa hỗ trợ wrap`);let s=Nn.join(String(n),`original-full.${r}`);this.#e(8,"ORIGINAL 1:1 · trích audio gốc nguyên vẹn (không encode lại)…");let[i]=await q.time("extract_full_ms",()=>Ue(t,[{fromAu:0,toAuExcl:t.track.auCount,outPath:s,wrap:o}],{token:this.#t}));return[re({index:0,start:0,end:t.durationS,coreStart:0,coreEnd:t.durationS,path:s,crcHex:i.crcHex,bytes:i.size})]}};function ut(e){return new Promise(t=>setTimeout(t,e))}c(ut,"sleep");function de(e,t){if(!Number.isFinite(e)||!Number.isFinite(t)||t<=.01)return"--:--";let n=Math.min(1,Math.max(0,t));if(n<=.01)return"--:--";let r=Math.max(0,e)/n;if(!Number.isFinite(r))return"--:--";let o=Math.max(0,r-Math.max(0,e)),s=Math.trunc(o),i=s%60,a=Math.floor(s/60)%60,l=Math.floor(s/3600);return l?`${l}:${String(a).padStart(2,"0")}:${String(i).padStart(2,"0")}`:`${String(a).padStart(2,"0")}:${String(i).padStart(2,"0")}`}c(de,"formatEta");function Cn(e,t){if(!Number.isFinite(e)||!Number.isFinite(t)||t<=0)return"0 cue/min";let n=Math.max(0,e)/t*60;return Number.isFinite(n)?`${n.toFixed(1)} cue/min`:"0 cue/min"}c(Cn,"formatThroughput");function Rn(e,t){let n=Number.isFinite(e)?e:0,r=Number.isFinite(t)?t:n;return Math.max(n,Math.min(100,r))}c(Rn,"progressSmooth");var Ht=class{static{c(this,"CircuitBreaker")}#t;#e;#n;#r=0;#i=0;#o="closed";#s=!1;#a=null;constructor(t,n=null,r=null,o=null){this.#t=t,this.#e=n??U.CIRCUIT_FAILS,this.#n=r??U.CIRCUIT_RESET_S,this.#a=o??null}get name(){return this.#t}get state(){return this.#o}#c(t){try{this.#a?.onState?.(t,this.#t)}catch{}try{q.incr(`circuit_${t}_${this.#t}`)}catch{}}#l(t){if(this.#o==="open")if(t-this.#i>=this.#n)this.#o="half_open",this.#c("half_open");else throw new xt(`Circuit open: ${this.#t}`);if(this.#o==="half_open"){if(this.#s)throw new xt(`Circuit half-open probe in flight: ${this.#t}`);this.#s=!0}}#u(){this.#r=0,this.#s=!1,this.#o!=="closed"&&this.#c("closed"),this.#o="closed"}#f(t,n){if(t instanceof ot||t instanceof xt){this.#o==="half_open"&&(this.#s=!1);return}if(t instanceof X&&t.retryable){this.#o==="half_open"&&(this.#s=!1);return}this.#r+=1,this.#r>=this.#e||this.#o==="half_open"?(this.#o="open",this.#i=n,this.#s=!1,this.#c("open")):this.#o==="half_open"&&(this.#s=!1)}async call(t){this.#l(performance.now()/1e3);try{let n=await t();return this.#u(),n}catch(n){throw this.#f(n,performance.now()/1e3),n}}};import Gn from"node:crypto";import qn from"node:fs";import He from"node:crypto";var mo="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";function $n(e,t){return He.createHmac("sha256",e).update(t,"utf8").digest()}c($n,"hmac");function go(e,t,n){let o=Object.entries(n).find(([m])=>String(m).toLowerCase()==="x-amz-date")?.[1];if(!o||!String(o).trim())throw new TypeError("aws4: missing x-amz-date");let s=String(o).split("T")[0],i=Object.entries(n).map(([m,g])=>[String(m).toLowerCase(),String(g).trim()]).sort((m,g)=>m[0]<g[0]?-1:m[0]>g[0]?1:0),a=i.map(([m,g])=>`${m}:${g}`).join(`
`)+`
`,l=i.map(([m])=>m).join(";"),u=`GET
/
${t}
${a}
${l}
${mo}`,p=`${s}/cn/vod/aws4_request`,h=["AWS4-HMAC-SHA256",o,p,He.createHash("sha256").update(u,"utf8").digest("hex")].join(`
`),b=$n(Buffer.from(`AWS4${e}`,"utf8"),s);for(let m of["cn","vod","aws4_request"])b=$n(b,m);return He.createHmac("sha256",b).update(h,"utf8").digest("hex")}c(go,"aws4VodSignature");function Pn(e){let t=Number(e);if(!Number.isFinite(t)||t<0)throw new TypeError("aws4: FileSize must be >= 0, got "+JSON.stringify(e));let n=encodeURIComponent;return["Action="+n("ApplyUploadInner"),"FileSize="+n(String(Math.trunc(t))),"FileType="+n("object"),"IsInner="+n("1"),"SpaceName="+n("lv-mac-recognition"),"Version="+n("2020-11-19"),"s="+n("5y0udbjapi")].join("&")}c(Pn,"buildApplyUploadQuery");function On(e,t,n,r){if(!String(e??"").trim())throw new TypeError("aws4: access key empty");if(!String(t??"").trim())throw new TypeError("aws4: secret key empty");if(!String(n??"").trim())throw new TypeError("aws4: session token empty");let o=new Date,s=c((p,h=2)=>String(p).padStart(h,"0"),"pad"),i=`${o.getUTCFullYear()}${s(o.getUTCMonth()+1)}${s(o.getUTCDate())}T${s(o.getUTCHours())}${s(o.getUTCMinutes())}${s(o.getUTCSeconds())}Z`,a=i.slice(0,8),l={"x-amz-date":i,"x-amz-security-token":String(n)},u=go(String(t),r,l);return l.authorization=`AWS4-HMAC-SHA256 Credential=${e}/${a}/cn/vod/aws4_request, SignedHeaders=x-amz-date;x-amz-security-token, Signature=${u}`,l}c(On,"buildApplyUploadAuthHeaders");async function Ln(e,{baseS:t=null,capS:n=null,processing:r=!0,rng:o=Math.random,deadline:s=null}={}){let i=t??(r?U.JY_POLL_MIN_S:U.JY_POLL_MAX_S*.7),a=n??U.JY_POLL_MAX_S,l=Math.min(i,a),u=typeof o=="function"?o:Math.random,p=Math.min(a,l*1.35**Math.min(e,12)),h=Math.min(1,Math.max(0,u())),b=l+h*(p-l);if(s!=null)try{if(typeof s.expired=="function"&&s.expired())throw new Error("deadline exceeded");typeof s.remaining=="number"&&Number.isFinite(s.remaining)&&(b=Math.min(b,Math.max(0,s.remaining)))}catch(m){if(m instanceof Error&&m.message==="deadline exceeded")throw m}return await ut(b*1e3),b}c(Ln,"fullJitterSleep");import Fn from"node:http";import Dn from"node:https";var wo=new Set(["ENOENT","EACCES","EISDIR","EPERM","ENOTDIR","ELOOP","ENAMETOOLONG"]),Bn=16*1024*1024,bo=new Set(["ECONNRESET","ECONNREFUSED","ECONNABORTED","EPIPE","EHOSTUNREACH","ENETUNREACH","ENETDOWN","ENOTFOUND","EAI_AGAIN","ETIMEDOUT"]);function We(e,t){if(e instanceof et)return e;let n=e?.code??"";if(n&&wo.has(n))return e;let r=String(e?.message??e??""),o=/socket hang up|connection closed|aborted/i.test(r);return!t&&bo.has(n)||o||n==="ABORT_ERR"?new et((n||"network")+": "+r,{detail:n,connectPhase:!t,cause:e}):new et((n||"network")+": "+r,{detail:n,cause:e})}c(We,"classifyNetworkError");function So(e,t){let n=e.headers;return{status:e.statusCode,ok:e.statusCode>=200&&e.statusCode<400,headers:n,header(r){let o=n[r.toLowerCase()];return Array.isArray(o)?o[0]:o},text(){return t.toString("utf8")},json(){return JSON.parse(t.toString("utf8"))},body:t}}c(So,"makeResponse");var he=class{static{c(this,"Session")}#t;#e;_lastUse=0;_inflight=0;constructor(t=U.POOL_SIZE){let n={keepAlive:!0,keepAliveMsecs:3e4,maxSockets:t,maxFreeSockets:t,scheduling:"lifo"};this.#t=new Dn.Agent(n),this.#e=new Fn.Agent(n),this._lastUse=Date.now()}async request(t,n,r={}){let{headers:o={},body:s=null,contentLength:i=null,timeout:a=null,followRedirects:l=!0,retry:u=yo}=r,p=u.total,h=u.connect,b=u.status,m=4,g=n,A=t.toUpperCase(),E=s===void 0?null:s,C=o,x=r.signal??null,S=r.token??null,d=r.maxBody??Bn;if(x?.aborted)throw new ot("request aborted before start");this._inflight=(this._inflight|0)+1;try{for(;;){try{S?.check?.()}catch($){throw $}if(x?.aborted)throw new ot("request aborted");let y;try{this._lastUse=Date.now(),y=await this.#n(A,g,C,E,a,i,d,x,S)}catch($){if(x?.aborted||S?.cancelled===!0)throw new ot("request aborted",{cause:$});if($ instanceof ot)throw $;let _=$ instanceof et?$:We($,!1);if((_ instanceof Dt||_.connectPhase&&!(_ instanceof Bt))&&h>0&&p>0){h-=1,p-=1,await ut(u.backoffFactor*1e3*2**(u.total-p-1));continue}throw _}if(l&&[301,302,303,307,308].includes(y.status)){let $=y.header("location");if($){if(m<=0)throw new et("too many redirects (limit 4) at "+g,{detail:$});m-=1;let _;try{_=new URL($,g).toString()}catch(P){throw new et("bad redirect location: "+String($).slice(0,200),{detail:$,cause:P})}try{new URL(_).origin!==new URL(g).origin&&(C=Object.fromEntries(Object.entries(C).filter(([P])=>!["authorization","cookie","proxy-authorization"].includes(P.toLowerCase()))))}catch{}g=_,(y.status===303||(y.status===301||y.status===302)&&A==="POST")&&(A="GET",E=null,C=Object.fromEntries(Object.entries(C).filter(([P])=>!["content-length","content-type","transfer-encoding"].includes(P.toLowerCase()))));continue}}if(b>0&&p>0&&u.statusForcelist.includes(y.status)){b-=1,p-=1,await ut(u.backoffFactor*1e3*2**(u.total-p-1));continue}return y}}finally{this._inflight=(this._inflight|0)-1}}#n(t,n,r,o,s,i,a=null,l=null,u=null){let p=a??Bn;return new Promise((h,b)=>{let m=new URL(n),g=m.protocol==="https:",A=g?Dn:Fn,E={protocol:m.protocol,hostname:m.hostname,port:m.port||void 0,path:`${m.pathname}${m.search}`,method:t,headers:r,agent:g?this.#t:this.#e},C=!1,x=!1,S=null,d=c(()=>{S!==null&&(clearTimeout(S),S=null)},"clearConnectTimer"),y=c(()=>{},"detachAbort"),$=c(()=>{},"detachToken"),_=c(I=>{if(!C){C=!0,d();try{y()}catch{}try{$()}catch{}try{M()}catch{}if(l?.aborted||u?.cancelled===!0||I instanceof ot){b(I instanceof ot?I:new ot("request aborted",{cause:I}));return}b(We(I,x))}},"fail"),P=A.request(E,I=>{x=!0,d();let R=[],v=0;I.on("data",w=>{if(v+=w.length,v>p){_(new et("response body exceeds cap ("+p+" bytes)",{detail:p}));try{I.destroy()}catch{}return}R.push(w)}),I.on("end",()=>{if(!C){C=!0;try{y()}catch{}try{$()}catch{}try{M()}catch{}h(So(I,Buffer.concat(R)))}}),I.on("error",_),I.on("close",()=>{!C&&!I.complete&&_(new et("response closed without end",{detail:"res-close"}))})});if(l)if(l.aborted)_(new ot("request aborted"));else{let I=c(()=>{try{P.destroy(new Error("aborted"))}catch{}},"onAbort");y=c(()=>{try{l.removeEventListener("abort",I)}catch{}},"detachAbort");try{l.addEventListener("abort",I,{once:!0})}catch{}}u&&typeof u.onCancel=="function"&&(u.cancelled===!0?_(new ot("request aborted")):$=u.onCancel(()=>{try{P.destroy(new ot("request aborted"))}catch{}})),P.on("error",_),P.on("close",()=>{d();try{M()}catch{}C||_(new et("socket closed without response",{detail:"req-close",connectPhase:!x}))});try{P.setNoDelay(!0)}catch{}let k=null;if(s!=null){let[I,R]=s;if(I!=null&&(S=setTimeout(()=>{P.destroy(new Dt(`connect timeout ${I}s`))},I*1e3)),R!=null){let v=c(w=>{try{w.setNoDelay(!0)}catch{}let N=c(()=>{P.destroy(new Bt(`read timeout ${R}s`))},"onTimeout");try{w.setTimeout(R*1e3,N)}catch{}k=c(()=>{try{w.removeListener("timeout",N)}catch{}try{w.setTimeout(0)}catch{}},"socketCleanup")},"onSocket");P.on("socket",v)}}let M=c(()=>{if(k){let I=k;k=null;try{I()}catch{}}},"cleanupSocket");if(o!=null){let I=Object.keys(r??{}).map(R=>R.toLowerCase());if(typeof o=="function"){!I.includes("content-length")&&i!=null&&P.setHeader("Content-Length",i);let R=o(),v=c(()=>{try{R&&!R.destroyed&&R.destroy()}catch{}},"destroyStream");P.on("close",v),P.on("error",v),R.on("error",w=>{P.destroy(We(w,x))}),R.on("data",w=>{if(!(P.destroyed||P.writableEnded)&&!P.write(w)){try{R.pause()}catch{}P.once("drain",()=>{try{R.resume()}catch{}})}}),R.on("end",()=>{try{P.end()}catch{}})}else{let R=Buffer.isBuffer(o)?o:Buffer.from(String(o),"utf8");I.includes("content-length")||P.setHeader("Content-Length",R.length),P.write(R),P.end()}}else P.end()})}get(t,n={}){return this.request("GET",t,n)}post(t,n={}){return this.request("POST",t,n)}put(t,n={}){return this.request("PUT",t,n)}close(){this.#t.destroy(),this.#e.destroy()}closeIdle(){try{this.#t.closeIdleConnections?.()}catch{}try{this.#e.closeIdleConnections?.()}catch{}}},yo=Object.freeze({total:2,connect:2,read:0,status:1,backoffFactor:.2,statusForcelist:[429,500,502,503,504]}),pt=null,xo=25e3;function jn(e=null){return new he(e??U.POOL_SIZE)}c(jn,"buildSession");function Un(){if(pt===null)return pt=jn(),pt;try{if(pt instanceof he&&Date.now()-(pt._lastUse||0)>xo){if((pt._inflight|0)>0){try{pt.closeIdle()}catch{}return pt}try{pt.close()}catch{}pt=jn()}}catch{}return pt}c(Un,"getSession");import zn from"node:crypto";import vo from"node:os";function Ao(){let e=vo.networkInterfaces();for(let n of Object.values(e))for(let r of n??[])if(r.mac&&r.mac!=="00:00:00:00:00:00"&&!r.internal)return Number.parseInt(r.mac.replace(/:/g,""),16);let t=zn.randomBytes(6);return t[0]|=1,Number.parseInt(t.toString("hex"),16)}c(Ao,"firstMacDecimal");var pe=null;function Jn(){if(pe)return pe;let e=new Date().getFullYear()%10,t;return e%2?t="3278516897751":t=String(Ao()).padStart(13,"0"),pe=`${390+e}${t}`,pe}c(Jn,"tdid");function me(e,t,n=null){if(!t||!String(t).trim())throw new TypeError("jyHeaders: deviceId must be non-empty");let r=String(n??U.JY_APPVR).trim();if(!r)throw new TypeError("jyHeaders: appVersion must be non-empty");let o=String(Math.floor(Date.now()/1e3)),s=e.length>=7?e.slice(-7):e,i=zn.createHash("md5").update(`9e2c|${s}|4|${r}|${o}|${t}|11ac`,"utf8").digest("hex");return{"User-Agent":U.JY_SIGN_UA,appvr:r,"device-time":o,pf:"4",sign:i,"sign-ver":"1",tdid:t,"Content-Type":"application/json"}}c(me,"jyHeaders");function ge(e){if(e==null)throw new TypeError("timestamp thiếu (null/undefined): "+JSON.stringify(e));if(e==="")throw new TypeError("timestamp không hợp lệ: "+JSON.stringify(e));let t=Number(e);if(!Number.isFinite(t))throw new TypeError("timestamp không hợp lệ: "+JSON.stringify(e));return Math.trunc(t)}c(ge,"toMs");function Hn(e){if(typeof e!="string")throw new TypeError("text phải là string, got: "+JSON.stringify(e)?.slice(0,120));return e}c(Hn,"toText");function Wn(e,t,n){if(e<0||t<0)throw new RangeError(n+": timestamp < 0 (start="+e+", end="+t+")");if(t<e)throw new RangeError(n+": end < start (start="+e+", end="+t+")")}c(Wn,"checkRange");function Eo(e){if(!Array.isArray(e))return null;let t=[];for(let n=0;n<e.length;n++){let r=e[n];if(r==null||typeof r!="object")throw new TypeError("word["+n+"] null/invalid");let o;try{o=Hn(r.text)}catch(a){throw new TypeError("word["+n+"] text invalid: "+a.message,{cause:a})}if(!o.trim())continue;let s,i;try{s=ge(r.start_time),i=ge(r.end_time)}catch(a){throw new TypeError("word["+n+"] timestamp invalid: "+a.message,{cause:a})}Wn(s,i,"word["+n+"]"),t.push({startMs:s,endMs:i,text:o})}return t.length>0?t:null}c(Eo,"toWords");function Yn(e){let t=e?.utterances;if(!Array.isArray(t))throw new TypeError("JianYing query thiếu utterances");return t.map((n,r)=>{try{if(n==null||typeof n!="object")throw new TypeError("utterance["+r+"] null/invalid");let o=ge(n.start_time),s=ge(n.end_time),i=Hn(n.text);return Wn(o,s,"utterance["+r+"]"),{startMs:o,endMs:s,text:i,words:Eo(n.words)}}catch(o){if(o instanceof TypeError||o instanceof RangeError){if(o._jyIdx===r)throw o;let s=o instanceof RangeError?RangeError:TypeError,i=new s("utterance["+r+"] invalid: "+o.message,{cause:o});throw i._jyIdx=r,i}throw o}})}c(Yn,"parseJianyingUtterances");var Kn=new Set([429,500,502,503,504]);function we(e,t){if(e.status>=400){let r=e.text();throw new X(`HTTP ${e.status}: ${r.slice(0,500)}`,{provider:"JianYing",phase:t,detail:r.slice(0,500),retryable:Kn.has(e.status)})}let n;try{n=e.json()}catch(r){let o="";try{o=String(e.text()).slice(0,120)}catch{}let s=/^\s*<(?:!doctype|html)/i.test(o);throw new X("phản hồi không phải JSON ("+t+"): "+o,{provider:"JianYing",phase:t,detail:o.slice(0,500),retryable:!s,cause:r})}return n}c(we,"ensureJson");async function Vn(e,t,{headers:n,timeout:r,label:o,jsonBody:s=null,data:i=null,token:a=null}){let l=s!==null?JSON.stringify(s):i,u=a?{headers:n,timeout:r,body:l,token:a}:{headers:n,timeout:r,body:l},p=await e.request("POST",t,u);return we(p,o)}c(Vn,"postJson");async function Xn(e,t,n,{appVersion:r=null,session:o=null,sleepFn:s=Ln,token:i=null,crcHex:a=null,audioSize:l=null}={}){let u=String(e),h=Number.isInteger(l)&&l>0?l:qn.statSync(u).size,b=a??wn(u),m=c(()=>qn.createReadStream(u,{highWaterMark:U.UPLOAD_HWM_BYTES}),"openAudio"),g=o??Un(),A=Jn(),E=r??U.JY_APPVR,C=U.JY_BASE,x=U.jyTimeout("long"),S=U.jyTimeout("poll"),d=U.jyTimeout("upload"),y=c(()=>i?.check(),"checkpoint"),$;if(await q.time("jy_upload_sign_ms",async()=>{n(20,"JianYing · xin credential…");let F="/lv/v1/upload_sign";for(;;){y();try{$=await Vn(g,C+F,{headers:me(F,A,E),timeout:x,label:"upload_sign",data:JSON.stringify({biz:"pc-recognition"}),token:i});return}catch(j){if(j instanceof X&&j.retryable){n(20,"JianYing · credential server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(j instanceof et))throw j;n(20,`JianYing · credential mạng lag, thử lại… (${j.name})`),await s(1,{processing:!1})}}}),String($.ret)!=="0")throw new X(`upload_sign: ${JSON.stringify($)}`,{provider:"JianYing",phase:"upload_sign",detail:$,retryable:!0});let _=$.data??{},P=_.access_key_id,k=_.secret_access_key,M=_.session_token;if(!P||!k||!M)throw new X("thiếu upload credential",{provider:"JianYing",phase:"upload_sign"});let I;await q.time("jy_apply_upload_ms",async()=>{let F=Pn(h),j=On(String(P),String(k),String(M),F),Y="https://vod.bytedanceapi.com/?"+F;for(;;){y();try{I=we(await g.get(Y,i?{headers:j,timeout:x,token:i}:{headers:j,timeout:x}),"upload_auth");return}catch(G){if(G instanceof X&&G.retryable){n(30,"JianYing · auth server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(G instanceof et))throw G;n(30,"JianYing · auth mạng lag, thử lại…"),await s(1,{processing:!1})}}});let R=I?.Result?.UploadAddress??{},v=(R.StoreInfos??[{}])[0]??{},w=v.StoreUri,N=v.Auth,O=v.UploadID,B=(R.UploadHosts??[""])[0];if(!w||!N||!O||!B)throw new X("upload auth thiếu dữ liệu",{provider:"JianYing",phase:"upload_auth"});await q.time("jy_put_ms",async()=>{n(40,"JianYing · upload audio…");let F="https://"+String(B)+"/"+String(w),j={"User-Agent":U.JY_UPLOAD_UA,Authorization:String(N),"Content-CRC32":b},Y;for(;;){y();try{Y=we(await g.put(`${F}?partNumber=1&uploadID=${O}`,{headers:j,body:m,contentLength:h,timeout:d,...i?{token:i}:{}}),"upload_put");break}catch(tt){if(tt instanceof X&&tt.retryable){n(40,"JianYing · upload server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(tt instanceof et))throw tt;n(40,"JianYing · upload lag, thử lại…"),await s(1,{processing:!1})}}if(Y.success!==0)throw new X(`upload: ${JSON.stringify(Y)}`,{provider:"JianYing",phase:"upload_put",detail:Y,retryable:!0});if(!/^[0-9a-fA-F]{8}$/.test(String(b).trim()))throw new X("merge crc không hợp lệ: "+JSON.stringify(b)?.slice(0,60),{provider:"JianYing",phase:"upload_merge",detail:String(b).slice(0,60),retryable:!1});let G="1:"+String(b).trim().toLowerCase(),rt=0;for(y();;){y();try{let tt=await g.post(`${F}?uploadID=${O}`,{headers:j,body:G,timeout:x,...i?{token:i}:{}});if(tt.status>=400){let Et=tt.text();if(Kn.has(tt.status)){n(40,"JianYing · merge server bận, thử lại…"),await s(1,{processing:!1});continue}throw new X(`HTTP ${tt.status}: ${Et.slice(0,500)}`,{provider:"JianYing",phase:"upload_merge",detail:Et.slice(0,500),retryable:!1})}let Qt=tt.text();if(/^\s*<(?:!doctype|html)/i.test(Qt.slice(0,120))){if(rt+=1,rt>=3)throw new X("merge trả về HTML (WAF?), dừng sau 3 lần thử",{provider:"JianYing",phase:"upload_merge",detail:Qt.slice(0,200),retryable:!1});n(40,"JianYing · merge HTML lạ, thử lại…"),await s(1,{processing:!1});continue}break}catch(tt){if(tt instanceof X||!(tt instanceof et))throw tt;n(40,"JianYing · merge lag, thử lại…"),await s(1,{processing:!1})}}});let z;if(await q.time("jy_submit_ms",async()=>{n(58,"JianYing · tạo task…");let F="/lv/v1/audio_subtitle/submit",j={adjust_endtime:U.JY_ADJUST_ENDTIME,audio:w,caption_type:U.JY_CAPTION_TYPE,client_request_id:Gn.randomUUID(),max_lines:1,songs_info:[{end_time:Math.max(1e3,Math.trunc(t)),id:"",start_time:0}],words_per_line:U.JY_WORDS_PER_LINE};for(;;){y(),j.client_request_id=Gn.randomUUID();try{z=await Vn(g,C+F,{headers:me(F,A,E),timeout:x,label:"submit",jsonBody:j,token:i});return}catch(Y){if(Y instanceof X&&Y.retryable){n(58,"JianYing · submit server bận, thử lại…"),await s(1,{processing:!1});continue}if(!(Y instanceof et))throw Y;n(58,"JianYing · submit lag, thử lại…"),await s(1,{processing:!1})}}}),String(z.ret)!=="0")throw new X(`submit: ${JSON.stringify(z)}`,{provider:"JianYing",phase:"submit",detail:z,retryable:!0});let J=String(z?.data?.id??"").trim();if(!J)throw new X("submit thiếu task id",{provider:"JianYing",phase:"submit"});let H="/lv/v1/audio_subtitle/query",K=U.JY_POLL_MAX_ATTEMPTS,D=0,T=c(async(F,j)=>F<=3?s(F,{...j,baseS:.12,capS:.25}):s(F,j),"paceSleep"),L=await q.time("jy_poll_ms",async()=>{for(let F=0;K<=0||F<K;F++){y();let j;try{let G=await g.post(C+H,{body:JSON.stringify({id:J,pack_options:{need_attribute:!0}}),headers:me(H,A,E),timeout:S,...i?{token:i}:{}});j=we(G,"query")}catch(G){if(G instanceof X&&G.retryable){D+=1,F%3===0&&n(Math.min(91,60+F%200/10|0),"JianYing · server bận, poll tiếp…"),await T(F,{processing:!1});continue}if(G instanceof et){D+=1,q.incr("jy_poll_network_blips"),F%3===0&&n(Math.min(91,60+F%200/10|0),`JianYing · mạng gián đoạn, poll tiếp… (#${D})`),await T(F,{processing:!0});continue}throw G}if(String(j.ret)!=="0"){q.incr("jy_poll_ret_nonzero"),await T(F,{processing:!1});continue}let Y=j.data;if(Y!=null){let G;try{G=Yn(Y)}catch(rt){throw new X(String(rt?.message??rt),{provider:"JianYing",phase:"query",detail:String(rt?.message??rt).slice(0,500),cause:rt})}return q.incr("jy_success"),n(92,`JianYing · ${G.length} utterances`),G}F%4===0&&n(Math.min(91,60+F%200/10|0),"JianYing · chờ ASR (không timeout)…"),await T(F,{processing:!0})}return null});if(L!==null)return L;throw q.incr("jy_timeout"),new X(`query dừng sau ${K} lần poll (task=${J})`,{provider:"JianYing",phase:"query",retryable:!0})}c(Xn,"jianying");var Wt=class{static{c(this,"TokenBucket")}#t;#e;#n;#r;constructor(t=null,n=null){let r=t??U.RATE_RPS;if(!Number.isFinite(r)||!(r>0))throw new TypeError("TokenBucket rate must be > 0, got "+JSON.stringify(t));let o=n??Math.max(1,r);if(!Number.isFinite(o)||!(o>0))throw new TypeError("TokenBucket capacity must be > 0, got "+JSON.stringify(n));this.#t=r,this.#e=o,this.#n=1e3/r,this.#r=performance.now()-this.#e*this.#n}get rate(){return this.#t}get capacity(){return this.#e}reset(){this.#r=performance.now()-this.#e*this.#n}async acquire(t=30,n=1){if(!Number.isFinite(n)||!(n>0))throw new TypeError("TokenBucket acquire cost must be > 0, got "+JSON.stringify(n));if(n>this.#e)throw new RangeError("TokenBucket cost "+n+" exceeds capacity "+this.#e);let r=performance.now(),o=this.#e*this.#n,s=n*this.#n,i=r-o,l=Math.max(this.#r,i)+s,u=l-r;return u<=0?(this.#r=l,!0):t!==null&&u>t*1e3?!1:(this.#r=l,await ut(u),!0)}};var at=Object.freeze({MAX_CHARS:42,SOFT_MAX_CHARS:56,MIN_DURATION_S:5/6,MAX_DURATION_S:7,CPS:20,GAP_MS:84,MERGE_GAP_S:1.5}),or=/[.!?…。！？]["»”')\]]?$/,Mo=/[,;:、，；：—]["»”')\]]?$/,qt=/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/,Qn=/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef。！？，、；：“”‘’（）《》【】]/,Io=new Set(["mr","mrs","ms","dr","prof","sr","jr","st","vs","etc","no","fig","approx","dept","est","min","max","inc","ltd","co","corp","vol","ch","sec","tp","ths","ts","pgs","gs","ks","bs","cn","jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec"]),_o=new Set(["a","an","the","this","that","these","those","my","your","his","her","its","our","their","some","any","no","every","each","is","am","are","was","were","be","been","being","have","has","had","do","does","did","will","would","shall","should","can","could","may","might","must","not","don't","doesn't","didn't","won't","wouldn't","can't","cannot","couldn't","shouldn't","isn't","aren't","wasn't","weren't","haven't","hasn't","hadn't","to","of","in","on","at","by","for","with","from","into","onto","very","các","những","mọi","mỗi","một","đang","sẽ","đã","vừa","mới","không","chẳng","chưa","đừng","chớ","rất","quá","hơi","cực","của","trong","trên","dưới","với","bằng","tại","về","cho"]),No=new Set(["and","but","or","nor","so","yet","because","although","though","while","whereas","since","unless","until","when","whenever","where","nhưng","mà","hoặc","hay","vì","bởi","do","nên","nếu","khi","tuy","dù","để","rằng","là","còn","thì"]);function ko(e){let t=0;for(let n=0;n<e.length;n++){let r=e.charCodeAt(n);if(r>=55296&&r<=56319&&n+1<e.length){let o=e.charCodeAt(n+1);o>=56320&&o<=57343&&n++}t++}return t}c(ko,"charLen");function To(e){return e>=12288&&e<=40959||e>=63744&&e<=64255||e>=65280&&e<=65519||e>=131072&&e<=195103}c(To,"isCjkCodePoint");function Yt(e){let t=0;for(let n=0;n<e.length;n++){let r=e.charCodeAt(n),o=r;if(r>=55296&&r<=56319&&n+1<e.length){let s=e.charCodeAt(n+1);s>=56320&&s<=57343&&(o=(r-55296<<10)+(s-56320)+65536,n++)}t+=To(o)?2:1}return t}c(Yt,"visualLen");function Vt(e){return String(e).split(/\s+/).filter(Boolean).join(" ")}c(Vt,"collapse");function Gt(e){return or.test(e.trim())}c(Gt,"endsSentence");function Ye(e,t){if(!e)return t;if(!t)return e;let n=e[e.length-1],r=t[0];return Qn.test(n)||Qn.test(r)?`${e}${t}`:`${e} ${t}`}c(Ye,"concatWordPair");function sr(e){let t=Vt(e),n=[],r=0;for(let s=0;s<t.length;s++){let i=t[s];if(i!=="."&&i!=="!"&&i!=="?"&&i!=="…"&&i!=="。"&&i!=="！"&&i!=="？"||i==="."&&/\d/.test(t[s-1]??"")&&/\d/.test(t[s+1]??"")||i==="."&&ir(t,s))continue;let a=s+1;for(;a<t.length&&/[.!?…。！？]/.test(t[a]);)a++;for(;a<t.length&&/["»”')\]]/.test(t[a]);)a++;if(i==="。"||i==="！"||i==="？"){n.push(t.slice(r,a).trim()),r=a,s=a-1;continue}(a>=t.length||/\s/.test(t[a]))&&(n.push(t.slice(r,a).trim()),r=a,s=a-1)}let o=t.slice(r).trim();return o&&n.push(o),n.filter(Boolean)}c(sr,"splitSentences");function ir(e,t){if(e[t+1]===".")return!1;let r=(e.slice(0,t).split(/\s+/).pop()??"").replace(/^["«“'([]+/,"");return!!(/(?:^|\s)(?:e\.g\.|i\.e\.|etc\.|v\.v\.|(?:[a-z]\.){2,})$/i.test(e.slice(0,t+1))||/^[A-Za-z]$/.test(r)||Io.has(r.toLowerCase()))}c(ir,"isAbbreviationDot");function Zn(e,t=""){if(e.length===0)return"";if(t&&!t.includes(" ")&&qt.test(t))return e.map(n=>n.text).join("");if(qt.test(t)){let n="";for(let r of e)n=Ye(n,r.text);return n}return e.map(n=>n.text).join(" ")}c(Zn,"joinWordTokens");function tr(e,t,n,r=""){let o=0;for(let i=0;i<n.length;i++){let a=n[i],l=t.slice(o,a+1);e.push({start:l[0].start,end:l[l.length-1].end,text:Zn(l,r),words:l,sentenceFlag:void 0,rawStartMs:null,rawEndMs:null}),o=a+1}let s=t.slice(o);e.push({start:s[0].start,end:s[s.length-1].end,text:Zn(s,r),words:s,sentenceFlag:void 0,rawStartMs:null,rawEndMs:null})}c(tr,"pushWordSlices");function be(e){return Vt(e).replace(/\s+/g,"")}c(be,"squashWhitespace");function er(e,t){let n=e.map(r=>r.text).join("");return n.length>0&&be(n)===be(t)}c(er,"wordsCoverText");function nr(e){return String(e??"").toLowerCase().replace(/^["«“'([—]+|["»”')\].,!?;:、，；：。！？…—]+$/g,"")}c(nr,"cleanWordToken");function rr(e,t,{clauseOnly:n=!1,softMax:r=56,cps:o=20}={}){let s=e.length;if(!Number.isInteger(t)||t<2||s<t)return[];let i=e.some(S=>qt.test(S.text)),a=new Float64Array(s+1);for(let S=0;S<s;S++)a[S+1]=a[S]+Yt(e[S].text)+(S>0&&!i?1:0);let l=a[s];if(!(l>0))return[];let u=l/t,p=new Uint8Array(s),h=new Float64Array(s);for(let S=0;S<s-1;S++){let d=e[S].text,y=or.test(d)||Mo.test(d);p[S]=y?1:0;let $=0;if(y)$+=12;else{let P=nr(d),k=nr(e[S+1].text);_o.has(P)&&($-=14),No.has(k)&&($+=4.5)}let _=Math.max(0,(e[S+1]?.start??e[S].end)-e[S].end);_>.02&&($+=Math.min(8,14*Math.log1p((_-.02)*10))),h[S]=$}if(n){let S=0;for(let d=0;d<s-1;d++)S+=p[d];if(S<t-1)return[]}let b=new Float64Array(t*s).fill(Number.POSITIVE_INFINITY),m=new Int32Array(t*s).fill(-1),g=c((S,d)=>{let y=a[d+1]-a[S]-(S>0&&!i?1:0),$=y-u,_=$*$/Math.max(1,u);if(y>r){let M=y-r;_+=M*M*1.5}let P=Math.max(.2,e[d].end-e[S].start),k=y/P;if(k>o){let M=k-o;_+=M*M*.8}return d===S&&y<4&&s>=t*2&&(_+=6),d<s-1&&(_-=h[d]),_},"spanCost"),A=s-t;for(let S=0;S<=A;S++)n&&!p[S]||(b[S]=g(0,S));for(let S=1;S<t;S++){let d=S===t-1,y=S,$=d?s-1:s-(t-S),_=d?s-1:y;for(let P=_;P<=$;P++){if(!d&&n&&!p[P])continue;let k=Number.POSITIVE_INFINITY,M=-1;for(let I=S-1;I<P;I++){let R=b[(S-1)*s+I];if(R===Number.POSITIVE_INFINITY)continue;let v=R+g(I+1,P);v<k&&(k=v,M=I)}b[S*s+P]=k,m[S*s+P]=M}}let E=b[(t-1)*s+(s-1)];if(!Number.isFinite(E))return[];let C=new Array(t-1),x=s-1;for(let S=t-1;S>=1;S--){let d=m[S*s+x];if(d<0)return[];C[S-1]=d,x=d}return C}c(rr,"chooseOptimalBreaksDP");function Co(e,t=1){if(!Array.isArray(e))return null;let n=Math.abs(t-1)>1e-9,r=[];for(let o=0;o<e.length;o++){let s=e[o];if(!s)continue;let i=Vt(s.text);!i||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<s.start||r.push({start:n?s.start/t:s.start,end:n?s.end/t:s.end,text:i})}return r.length>0?r:null}c(Co,"toTimelineWords");function Ro(e,t=null){if(Array.isArray(t)&&t.length>1){let s=[],i=0,a=!0;for(let l=0;l<t.length;l++){let u=be(t[l]);if(!u)continue;let p=[],h="";for(;i<e.length&&h.length<u.length;){let b=e[i++];p.push(b),h+=be(b.text)}if(p.length===0||h!==u){a=!1;break}s.push({text:t[l],words:p})}if(a&&i===e.length&&s.length===t.length)return s}let n=[],r=[],o="";for(let s of e)r.push(s),o=Ye(o,s.text),Gt(o)&&sr(o).length>=1&&!ir(o,o.length-1)&&(n.push({text:o,words:r}),r=[],o="");return r.length>0&&n.push({text:o,words:r}),n}c(Ro,"groupWordsIntoSentences");function Ge(e,t={}){let n=t.softMaxChars??at.SOFT_MAX_CHARS,r=t.minS??at.MIN_DURATION_S,o=t.maxS??at.MAX_DURATION_S,s=t.cps??at.CPS,i=(t.gapMs??at.GAP_MS)/1e3,a=t.mergeGapS??at.MERGE_GAP_S,l=gt(t.speed??mt),u=Math.abs(l-1)>1e-9,p=u?a/l:a;if(!Number.isFinite(r)||!Number.isFinite(o)||r>o)throw new RangeError(`buildCues: require finite minS<=maxS (got minS=${r}, maxS=${o})`);if(!Array.isArray(e))throw new TypeError("buildCues: segments must be an array");let h=[],b=[...e].filter(d=>d&&Vt(d.text)).sort((d,y)=>d.start-y.start||d.end-y.end);for(let d of b){if(!Number.isFinite(d.start)||!Number.isFinite(d.end))throw new RangeError(`buildCues: segment start/end must be finite (got ${d.start}, ${d.end})`);let y=Vt(d.text);if(!y)continue;let $=u?d.start/l:d.start,_=u?d.end/l:d.end,P=Co(d.words,l),k=sr(y),M=d.rawStartMs!=null?u?Math.round(d.rawStartMs/l):d.rawStartMs:null,I=d.rawEndMs!=null?u?Math.round(d.rawEndMs/l):d.rawEndMs:null;if(k.length<=1||!P){h.push({start:$,end:_,text:y,words:P,sentenceFlag:Gt(y),rawStartMs:M,rawEndMs:I});continue}let R=Ro(P,k);if(R.length!==k.length){h.push({start:$,end:_,text:y,words:P,sentenceFlag:Gt(y),rawStartMs:M,rawEndMs:I});continue}for(let v of R)h.push({start:v.words[0].start,end:v.words[v.words.length-1].end,text:v.text,words:v.words,sentenceFlag:Gt(v.text),rawStartMs:null,rawEndMs:null})}let m=[],g=null;for(let d of h){if(g===null){g={...d,sources:[d]};continue}let y=qt.test(g.text)||qt.test(d.text),$=d.start-g.end,_=Yt(g.text)+(y?0:1)+Yt(d.text);!y&&!g.sentenceFlag&&$<=p+1e-9&&$>=-(u?.05/l:.05)&&_<=n*2?(g.text=Ye(g.text,d.text),g.end=Math.max(g.end,d.end),g.sentenceFlag=d.sentenceFlag??Gt(d.text),g.words=g.words&&d.words?[...g.words,...d.words]:null,g.rawStartMs=g.rawStartMs??d.rawStartMs??null,g.rawEndMs=d.rawEndMs??g.rawEndMs??null,g.sources.push(d)):(m.push(g),g={...d,sources:[d]})}g!==null&&m.push(g);let A=[];for(let d of m){let y=Yt(d.text);if(y<=n){A.push(d);continue}let $=d.text.split(" "),_=Math.ceil(y/n),k=Array.isArray(d.words)&&d.words.length>0&&(d.words.length===$.length||er(d.words,d.text)),M=k?rr(d.words,_,{clauseOnly:!0,softMax:n,cps:s}):[];if(M.length<_-1){if(d.sources&&d.sources.length>1&&d.end-d.start>o){for(let R of d.sources)A.push(R);continue}let I=k&&er(d.words,d.text)?rr(d.words,_,{clauseOnly:!1,softMax:n,cps:s}):[];if(I.length===_-1&&_>1){tr(A,d.words,I,d.text);continue}A.push(d);continue}tr(A,d.words,M,d.text)}A.sort((d,y)=>d.start-y.start||d.end-y.end);let E=[],C=-1/0,x=[];for(let d=0;d<A.length;d++){let y=A[d],$=y.start,_=Math.max(y.start,C);_-$>.05&&x.push(`start-shifted:${E.length+1}`);let P=d+1<A.length?A[d+1].start:Number.POSITIVE_INFINITY,k=P<Number.POSITIVE_INFINITY?Math.max(y.end,Math.min(_+r,P-i)):_+r,M=Math.max(y.end,k,_+.001);E.push(bt({start:_,end:M,text:y.text,words:y.words??[],rawStartMs:y.rawStartMs??null,rawEndMs:y.rawEndMs??null})),C=M+i}for(let d=0;d<E.length;d++){let y=E[d],$=Yt(y.text)/s,_=d+1<E.length?E[d+1].start-i:Number.POSITIVE_INFINITY,P=Math.min(y.start+$,y.start+o,_);P>y.end&&(E[d]=bt({start:y.start,end:P,text:y.text,words:y.words,rawStartMs:y.rawStartMs,rawEndMs:y.rawEndMs}))}let S=E.map((d,y)=>{let $=y+1<E.length?E[y+1].start-i:Number.POSITIVE_INFINITY,_=Math.min(d.end,d.start+o,$),P=Math.min(d.start+Math.min(r,o),$);return bt({start:d.start,end:Math.max(_,P,d.start+.001),text:d.text,words:d.words,rawStartMs:d.rawStartMs,rawEndMs:d.rawEndMs})});return{cues:S,warnings:[...x,...$o(S,{cps:s,minS:r,gap:i,maxS:o})]}}c(Ge,"buildCues");function $o(e,{cps:t,minS:n,gap:r,maxS:o=null}){let s=[];for(let i=0;i<e.length;i++){let a=e[i],l=a.end-a.start;l<n-1e-9&&s.push(`duration<min: cue ${i+1}`),o!==null&&l>o+1e-9&&s.push(`duration>max: cue ${i+1}`),ko(a.text)/l>t&&s.push(`cps>${t}: cue ${i+1}`),i>0&&a.start-e[i-1].end<r-1e-9&&s.push(`gap<${Math.round(r*1e3)}ms: cue ${i+1}`)}return s}c($o,"collectWarnings");function ar(e){let t=[],n=-1/0;for(let r=0;r<e.length;r++){let o=e[r],s=r+1;o.text.trim()||t.push(`Cue ${s}: rỗng`),o.end<=o.start&&t.push(`Cue ${s}: end <= start`),o.start<n&&t.push(`Cue ${s}: chồng lấn`),o.text.includes(`
`)&&t.push(`Cue ${s}: nhiều dòng`),n=o.end}return t}c(ar,"validateNetflix");import Po from"node:crypto";import ct from"node:fs";import cr from"node:path";function st(e,t){ct.mkdirSync(cr.dirname(String(e)),{recursive:!0});let n=`${process.pid}.${Date.now()}.${Po.randomBytes(4).toString("hex")}`,r=`${e}.partial.${n}`,o;try{o=ct.openSync(r,"wx")}catch(i){try{ct.rmSync(r,{force:!0})}catch{}throw i}try{ct.writeFileSync(o,t,"utf8");try{ct.fsyncSync(o)}catch{}}catch(i){try{ct.closeSync(o)}catch{}try{ct.rmSync(r,{force:!0})}catch{}throw i}ct.closeSync(o);let s=null;for(let i=0;i<5;i++)try{ct.renameSync(r,e),s=null;break}catch(a){if(s=a,i<4&&(a?.code==="EPERM"||a?.code==="EACCES"||a?.code==="EBUSY")){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10*(i+1));continue}break}if(s){try{ct.rmSync(r,{force:!0})}catch{}throw s}try{let i=ct.openSync(cr.dirname(String(e)),"r");try{ct.fsyncSync(i)}finally{ct.closeSync(i)}}catch{}}c(st,"atomicWriteText");var qe=Array.from({length:100},(e,t)=>String(t).padStart(2,"0")),Oo=Array.from({length:1e3},(e,t)=>String(t).padStart(3,"0"));function Kt(e){if(!Number.isFinite(e))throw new RangeError(`exactMsToSrt: ms must be finite (got ${e})`);let t=Math.max(0,Math.trunc(e)),n=Math.floor(t/36e5);t-=n*36e5;let r=Math.floor(t/6e4);t-=r*6e4;let o=Math.floor(t/1e3);return t-=o*1e3,`${n<100?qe[n]:String(n).padStart(2,"0")}:${qe[r]}:${qe[o]},${Oo[t]}`}c(Kt,"exactMsToSrt");function Ve(e){if(!Number.isFinite(e))throw new RangeError(`srtTimeFloat: seconds must be finite (got ${e})`);return e<0?Kt(0):Kt(Math.round(e*1e3))}c(Ve,"srtTimeFloat");function lr(e,t,n=1){if(!Number.isFinite(n)||Math.abs(n-1)<=1e-9)return[e,t];let r=Math.max(0,Math.round(e/n)),o=Math.max(0,Math.round(t/n)),s=t>e?Math.max(r+1,o):Math.max(r,o);return[r,s]}c(lr,"scaleRangeMs");function ur(e){return ar(e)}c(ur,"validate");function fr(e){let t=ur(e);if(t.length>0)throw new Zt("SRT không hợp lệ: "+t.slice(0,5).join("; "));return e.map((n,r)=>`${r+1}
${Ve(n.start)} --> ${Ve(n.end)}
${n.text}`).join(`

`)+`
`}c(fr,"renderSrt");function dr(e){let t=[];for(let n=0;n<e.length;n++){let r=e[n];t.push(`${n+1}
${Kt(r.startMs)} --> ${Kt(r.endMs)}
${r.text}`)}return t.join(`

`)+`
`}c(dr,"rawSrtRows");var Lo=/[^\p{L}\p{N}]+/gu,mr=.78,Fo=8,Do=.92,hr=/[.!?…。！？]["»”')\]]?$/,Xe=/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;function Qe(e){return String(e).normalize("NFKC").toLowerCase().replace(/ß/g,"ss").replace(/ς/g,"σ").replace(/ẛ/g,"ṡ").replace(Lo,"")}c(Qe,"normalize");var Ke=new Uint32Array(65536);function Bo(e,t){let n=e.length,r=t.length;if(n===0)return r;if(r===0)return n;if(e===t)return 0;if(n>32)return jo(e,t);for(let l=0;l<n;l++)Ke[e.charCodeAt(l)]|=1<<l;let o=-1,s=0,i=n,a=1<<n-1;for(let l=0;l<r;l++){let u=Ke[t.charCodeAt(l)],p=u|s,h=(u&o)+o^o|u,b=s|~(h|o),m=o&h;b&a?i+=1:m&a&&(i-=1),b=b<<1|1,m=m<<1,o=m|~(p|b),s=b&p}for(let l=0;l<n;l++)Ke[e.charCodeAt(l)]=0;return i}c(Bo,"myersEditDistance");var ft=new Int32Array(512);function jo(e,t){let n=e.length,r=t.length;r+1>ft.length&&(ft=new Int32Array(Math.max(r+1,ft.length*2)));for(let o=0;o<=r;o++)ft[o]=o;for(let o=1;o<=n;o++){let s=ft[0];ft[0]=o;let i=e.charCodeAt(o-1);for(let a=1;a<=r;a++){let l=ft[a];if(i===t.charCodeAt(a-1))ft[a]=s;else{let u=ft[a-1],p=ft[a],h=s;ft[a]=1+(u<p?u<h?u:h:p<h?p:h)}s=l}}return ft[r]}c(jo,"wagnerFischerDistance");var Se=new Int32Array(1024),gr=new Int32Array(1024),Xt=new Int32Array(1024);function Uo(e){if(e+2<=Se.length)return;let t=Se.length;for(;t<e+2;)t*=2;Se=new Int32Array(t),gr=new Int32Array(t),Xt=new Int32Array(t)}c(Uo,"ensureScratchCapacity");function zo(e){let t=new Map;for(let r=0;r<e.length;r++){let o=e[r],s=t.get(o);s?s.push(r):t.set(o,[r])}let n=new Set;if(e.length>=200){let r=Math.floor(e.length/100)+1;for(let[o,s]of t)s.length>r&&(n.add(o),t.delete(o))}return{b2j:t,autojunk:n}}c(zo,"buildB2J");function Jo(e,t,n,r,o,s,i,a){Uo(r.length);let l=Se,u=gr,p=0,h=t,b=o,m=0;for(let g=t;g<n;g++){for(let C=0;C<p;C++)u[Xt[C]]=0;let A=0;if(!a.has(e[g])){let C=i.get(e[g]);if(C!==void 0)for(let x=0;x<C.length;x++){let S=C[x];if(S<o)continue;if(S>=s)break;let d=(S>o?l[S-1]:0)+1;u[S]=d,Xt[A++]=S,d>m&&(h=g-d+1,b=S-d+1,m=d)}}for(let C=0;C<p;C++){let x=Xt[C];u[x]===0&&(l[x]=0)}let E=l;l=u,u=E,p=A}for(let g=0;g<p;g++)l[Xt[g]]=0;return[h,b,m]}c(Jo,"findLongestMatchFast");function Ho(e,t){let{b2j:n,autojunk:r}=zo(t),o=[],s=[[0,e.length,0,t.length]];for(;s.length>0;){let[a,l,u,p]=s.pop(),[h,b,m]=Jo(e,a,l,t,u,p,n,r);m>0&&(o.push([h,b,m]),a<h&&u<b&&s.push([a,h,u,b]),h+m<l&&b+m<p&&s.push([h+m,l,b+m,p]))}o.sort((a,l)=>a[0]-l[0]||a[1]-l[1]);let i=[];for(let a of o){let l=i[i.length-1];l&&l[0]+l[2]===a[0]&&l[1]+l[2]===a[1]?l[2]+=a[2]:i.push([...a])}return i}c(Ho,"matchingBlocks");function Wo(e,t){return e===t?1:e.length===0||t.length===0?0:2*Ho(e,t).reduce((r,[,,o])=>r+o,0)/(e.length+t.length)}c(Wo,"sequenceRatio");function Yo(e,t,n=null,r=null){let o=n??Qe(e),s=r??Qe(t);return!o||!s?0:o===s?1:2*Math.min(o.length,s.length)/(o.length+s.length)<mr?0:o.includes(s)||s.includes(o)?Math.min(o.length,s.length)/Math.max(o.length,s.length):Wo(o,s)}c(Yo,"similarity");function Go(e,t,n){if(Math.min(e.end,t.end)-Math.max(e.start,t.start)<-.25||t.start<e.start||t.end<=e.end||!(Array.isArray(e.words)&&e.words.length>=2&&Array.isArray(t.words)&&t.words.length>=2))return null;let s=e.words,i=t.words,a=Math.min(s.length-1,i.length-1,12);if(a<2)return null;for(let l=a;l>=2;l--){let u=!0,p=0;for(let h=0;h<l;h++){let b=n(s[s.length-l+h].text),m=n(i[h].text);if(!b||!m){u=!1;break}if(b!==m){let g=Bo(b,m);if(Math.max(b.length,m.length)<4||g>1){u=!1;break}}p+=b.length}if(u&&p>=4){let h=[...s,...i.slice(l)],b=Xe.test(e.text)||Xe.test(t.text),m=h.map(E=>E.text).join(b?"":" "),g=Math.min(e.start,t.start),A=Math.max(e.end,t.end);return A-g>25?null:bt({start:g,end:A,text:m,words:h,rawStartMs:null,rawEndMs:null})}}return null}c(Go,"trySplicePartialOverlap");function wr(e=null){let t=e??U.OVERLAP_S,n=[],r=new Map,o=c(s=>{let i=r.get(s);return i===void 0&&(i=Qe(s),r.set(s,i)),i},"cachedNorm");return{merged:n,pushPart(s){let i=qo(s)?s:[...s].sort((a,l)=>a.start-l.start||a.end-l.end);for(let a of i)Vo(n,a,t,o)}}}c(wr,"createIncrementalMerger");function pr(e){let t=0;for(let n=0;n<e.length;n++)t+=Xe.test(e[n])?2:1;return t}c(pr,"normInfoLen");function qo(e){for(let t=1;t<e.length;t++){let n=e[t-1],r=e[t];if(r.start<n.start||r.start===n.start&&r.end<n.end)return!1}return!0}c(qo,"isSortedByTime");function Vo(e,t,n,r){let o=null,s=0,i=r(t.text),a=pr(i),l=Math.max(0,e.length-20);for(let u=l;u<e.length;u++){let p=e[u];if(Math.abs(t.start-p.start)>n*1.8)continue;let h=r(p.text),m=Math.min(pr(h),a)<Fo?Do:mr,g=Yo(p.text,t.text,h,i);if(g<m||g<=s)continue;let A=Math.min(p.end,t.end)-Math.max(p.start,t.start),E=Math.abs(t.start-p.start);if(!(A>=0||A>=-1&&E<=1))continue;let x=Math.min(p.start,t.start),d=Math.max(p.end,t.end)-x,y=Math.max(p.end-p.start,t.end-t.start);d>60||d>y+n+1||(o=u,s=g)}if(o!==null){let u=e[o],p=t.text.trim().length,h=u.text.trim().length,b=p>h||p===h&&hr.test(t.text.trim())&&!hr.test(u.text.trim()),m=b?t.text:u.text,g=b?t.words?.length?t.words:u.words??[]:u.words?.length?u.words:t.words??[];e[o]=bt({start:Math.min(u.start,t.start),end:Math.max(u.end,t.end),text:m,words:g,rawStartMs:u.rawStartMs??t.rawStartMs??null,rawEndMs:t.rawEndMs??u.rawEndMs??null});return}if(e.length>0){let u=e.length-1,p=Go(e[u],t,r);if(p){e[u]=p;return}}e.push(t)}c(Vo,"mergeSingle");var ye=class{static{c(this,"LiveSRTPublisher")}#t;#e;#n;#r=new Map;#i=0;#o=0;#s=null;#a=0;constructor(t,n,{exact:r}){this.#t=t,this.#e=n,this.#n=r,this.published=[]}get warnings(){return this.#i}onChunkDone(t,n){for(this.#r.set(t,n);this.#r.has(this.published.length);){let r=this.published.length;this.published.push(this.#r.get(r)),this.#r.delete(r)}return this.flush()}flush(){let t=gt(this.#e?.speed??mt);if(this.#n){let i=Math.abs(t-1)>1e-9,a=this.published.flat().map(l=>{let u=l.startMs??(Number.isFinite(l.start)?Math.round(l.start*1e3):l.startMs),p=l.endMs??(Number.isFinite(l.end)?Math.round(l.end*1e3):l.endMs),[h,b]=i?lr(u,p,t):[u,p];return{startMs:h,endMs:b,text:l.text}});return a.length>0&&st(this.#t,dr(a)),a}this.#s||(this.#s=wr());for(let i=this.#a;i<this.published.length;i++)this.#s.pushPart(this.published[i]);this.#a=this.published.length;let n=[...this.#s.merged].sort((i,a)=>i.start-a.start||i.end-a.end),{cues:r,warnings:o}=Ge(n,{softMaxChars:this.#e.softMaxChars??at.SOFT_MAX_CHARS,maxS:this.#e.maxDuration??at.MAX_DURATION_S,minS:this.#e.minDuration??at.MIN_DURATION_S,cps:this.#e.cps??at.CPS,gapMs:this.#e.gapMs??at.GAP_MS,mergeGapS:this.#e.mergeGapS??at.MERGE_GAP_S,speed:t});this.#i=o.length;let s=o.length-this.#o;return s!==0&&q.incr("netflix_warning",s),this.#o=o.length,r.length>0&&st(this.#t,fr(r)),r}};var Ko=Object.freeze({product:"ASRStudio UltraX (NodeJS)",version:"unknown",input:null,output:null,model:null,language:"auto",chunks:0,cues:0,elapsed_seconds:0,metrics:null});function br(e={}){return{...Ko,...e}}c(br,"buildRunMetadata");function Sr(e,t){st(e,JSON.stringify(t,null,2))}c(Sr,"writeMetadata");function yr(e,t="server",n=[]){let r={provider:t,utterances:n.map(o=>({start_time:o.startMs,end_time:o.endMs,text:o.text}))};st(e,JSON.stringify(r,null,2))}c(yr,"writeRawUtterances");function xr(e){let t=Math.max(0,Math.floor(e)),n=Math.floor(t/36e5),r=Math.floor(t%36e5/6e4),o=Math.floor(t%6e4/1e3),s=t%1e3;return`${String(n).padStart(2,"0")}:${String(r).padStart(2,"0")}:${String(o).padStart(2,"0")}.${String(s).padStart(3,"0")}`}c(xr,"msToVtt");function vr(e){let t=`WEBVTT

`,n=e.map((r,o)=>{let s=r.startMs!=null?r.startMs:r.rawStartMs!=null?r.rawStartMs:Math.round(r.start*1e3),i=r.endMs!=null?r.endMs:r.rawEndMs!=null?r.rawEndMs:Math.round(r.end*1e3);return`${o+1}
${xr(s)} --> ${xr(i)}
${r.text}`}).join(`

`);return t+n+`
`}c(vr,"renderVtt");function Xo(e){let t=Math.max(0,Math.floor(e)),n=Math.floor(t/6e4),r=Math.floor(t%6e4/1e3),o=Math.floor(t%1e3/10);return`[${String(n).padStart(2,"0")}:${String(r).padStart(2,"0")}.${String(o).padStart(2,"0")}]`}c(Xo,"msToLrc");function Ar(e){return e.map(t=>{let n=t.startMs!=null?t.startMs:t.rawStartMs!=null?t.rawStartMs:Math.round(t.start*1e3);return`${Xo(n)}${t.text}`}).join(`
`)+`
`}c(Ar,"renderLrc");function Er(e){return e.map(t=>String(t.text||"").trim()).filter(Boolean).join(`
`)+`
`}c(Er,"renderTxt");var kt="AUTO TURBO · JianYing",St="JianYing ORIGINAL 1:1 · client 10.9",Mr=Object.freeze([kt,St]);function Ir(e){if(e===St||e===kt)return"JianYing";throw new lt(`Model không hợp lệ: ${e}`)}c(Ir,"resolveProvider");function _r(e){if(e===St||e===kt)return{model:e,provider:"JianYing"};throw new lt(`Model không hợp lệ: ${e} · hợp lệ: ${Mr.join(" | ")}`)}c(_r,"resolveEngine");async function*Nr(e,t,{maxWorkers:n,token:r=null}={}){if(!Number.isFinite(n)||n<1)throw new TypeError(`maxWorkers phải là số hữu hạn >= 1, nhận: ${n}`);let o=[...t];if(o.length===0)return;let s=Math.max(1,Math.min(Math.trunc(n),o.length)),i=[],a=c(()=>{},"wake"),l=0,u=0,p=!1,h=c(()=>{if(p||l>=o.length||u>=s)return;let m=o[l++];u+=1,Promise.resolve().then(()=>e(m)).then(g=>{p||(i.push({item:m,result:g}),a())},g=>{if(p)return;let A=g instanceof Error?g:new Error(String(g??"unknown error"));i.push({item:m,error:A}),a()})},"launch");for(let m=0;m<s;m++)h();let b=c(()=>new Promise((m,g)=>{let A=null,E=c(()=>{},"unsub"),C=c(()=>{A!==null&&(clearTimeout(A),A=null);try{E()}catch{}a=c(()=>{},"wake")},"cleanup");a=c(()=>{C(),m()},"done"),r&&typeof r.onCancel=="function"&&(E=r.onCancel(()=>{C();try{r.check(),m()}catch(S){g(S)}})),A=setTimeout(()=>{C();try{r?.check()}catch(S){g(S);return}m()},50)}),"idleWithCancel");try{for(;i.length>0||u>0;){for(;i.length===0&&u>0;)await b(),r?.check();r?.check();let m=i.shift();m&&(u-=1,h(),yield[m.item,"error"in m?m.error:m.result])}}finally{p=!0,i.length=0,a=c(()=>{},"wake")}}c(Nr,"mapAsCompleted");var Zo="9.0.0",xe=class e{static{c(this,"CloudPipeline")}#t;#e;#n=new Map;#r=new Map;#i=0;#o=0;#s=new Ht("jianying");#a=new Wt;static ASR_BASE=26;static ASR_SPAN=68;static weightedAverage(t,n){let r=0,o=0;for(let[s,i]of t){let a=n.get(s)??1;r+=a*i,o+=a}return o>0?r/o:0}constructor(t=new Pt,n=()=>{}){this.#t=t,this.#e=n}#c(t,n,r,o){let s=this.#n.get(t)??0;this.#n.set(t,Math.max(s,r));let i=e.weightedAverage(this.#n,this.#r),a=Math.max(this.#o,Math.min(94,e.ASR_BASE+Math.round(e.ASR_SPAN*i/100)));this.#o=a;let l="";if(this.#i>0&&i>1&&i<100){let u=(performance.now()-this.#i)/1e3,p=Math.min(1,i/100);l=` · ETA ${de(u,p)}`}this.#e(a,`Đoạn ${t+1}/${n} · ${o}${l}`)}async#l(t,n,r,o){let s=c((a,l)=>this.#c(n.index,r,a,`${t} · ${l}`),"callback"),i=c(()=>this.#s.call(async()=>{if(!await this.#a.acquire(60))throw new X("rate limited locally",{provider:"JianYing",phase:"rate",retryable:!0});return Xn(n.path,Math.round((n.end-n.start)*1e3),s,{appVersion:o,token:this.#t,crcHex:n.crcHex,audioSize:n.bytes})}),"attemptCall");try{return await i()}catch(a){if(a instanceof xt)return this.#t.check(),await ut(U.CIRCUIT_RESET_S*1e3),this.#t.check(),await i();if(kr(a)){let l=a;for(let u=1;u<=3;u++){this.#t.check(),await ut(Math.min(5e3,500*2**u)),this.#t.check();try{return await i()}catch(p){if(l=p,!kr(p))throw p}}throw l}throw a}}async#u(t,n,r,o,s=null){this.#t.check();let i=s??Ir(r),a;try{a=await q.time(`recognize_${i.toLowerCase()}_ms`,()=>this.#l(i,t,n,o))}catch(u){throw te(u)?u:(q.incr("provider_errors"),q.incr("chunks_fail"),new lt(`Đoạn ${t.index+1} thất bại · ${i}: ${u instanceof f?u.describe():String(u?.message??u)}`,{cause:u}))}if(r===St){if(a.length===0)throw q.incr("chunks_fail"),new lt(`Đoạn ${t.index+1} thất bại · ${i}: kết quả rỗng`);return q.incr("chunks_ok"),[t.index,a,i]}let l=a.filter(u=>{let p=u.text.trim()&&u.endMs>u.startMs;return p||q.incr("rows_dropped"),p}).map(u=>bt({start:t.start+u.startMs/1e3,end:t.start+u.endMs/1e3,text:u.text.trim(),words:es(u.words,t.start)}));if(l.length===0)throw q.incr("chunks_fail"),new lt(`Đoạn ${t.index+1} thất bại · ${i}: kết quả rỗng`);return q.incr("chunks_ok"),[t.index,l,i]}async run(t){let n=q.snapshot(),r=performance.now()/1e3,o=t.inputPath,s=t.outputPath;if(!Tt.existsSync(o)||!Tt.statSync(o).isFile())throw new lt(`Không tìm thấy file: ${o}`);let{model:i,provider:a}=_r(t.model),l=t.jianyingAppVersion||U.JY_APPVR,u=Tt.mkdtempSync(Ze.join(Qo.tmpdir(),"asr-ultrax-")),p=zt(o),h=p.durationS,b=!1,m=t.speed??1,g=Math.abs(m-.8)<1e-4,A=t.physicalSpeed===!0||g&&t.physicalSpeed!==!1;if(Math.abs(m-1)>1e-6&&A&&En())try{let I=m.toFixed(2).replace(/\.?0+$/,""),R=Ze.join(u,`converted-${I}x.mp3`);if(this.#e(4,`Chuyển đổi âm thanh chuẩn ${I}x (không mô phỏng) bằng FFmpeg…`),await Mn(o,R,m,{token:this.#t}),Tt.existsSync(R)&&Tt.statSync(R).size>0&&(p=zt(R),h=p.durationS,b=!0,this.#e(7,`Đã chuyển đổi âm thanh ${I}x thành công · request ASR trực tiếp…`),!t.srtOnly&&!t.noJunk))try{let v=Ft(s,`_${I}x.mp3`);Tt.copyFileSync(R,v)}catch{}}catch(I){if(t.physicalSpeed===!0)throw I}this.#n=new Map,this.#r=new Map,this.#o=0,this.#i=performance.now(),this.#s=new Ht("jianying"),this.#a=new Wt;let E=i===St,C=b?{...t,speed:1}:t,x=new ye(s,C,{exact:E}),S=new Map,d=1,y=[];try{let I=new fe(this.#t,this.#e),R=E?await I.singleOriginal(p,u):await I.split(p,u),v=R.length;d=Math.min(U.maxWorkers(t.maxWorkers),v);let w=0;for(let z of R){let J=Math.max(.001,z.end-z.start);this.#r.set(z.index,J),w+=J}let N=0;this.#e(e.ASR_BASE,`UltraX ${d} luồng · ${v} đoạn · ${i}…`);let O=c(z=>this.#u(z,v,i,l,a),"job");for await(let[z,J]of Nr(O,R,{maxWorkers:d,token:this.#t})){if(this.#t.check(),J instanceof Error){try{this.#t.cancel()}catch{}throw J}if(!Array.isArray(J)){try{this.#t.cancel()}catch{}throw new lt(`Đoạn ${z.index+1} thất bại · ${a}: kết quả không hợp lệ (${typeof J})`,{cause:J instanceof Error?J:void 0})}let[H,K,D]=J;S.set(H,D);let T=x.onChunkDone(H,K);N+=this.#r.get(H)??1;let L=w>0?N/w:0,F=e.ASR_BASE+Math.round(e.ASR_SPAN*L),j=Math.min(94,Math.max(this.#o,F));this.#o=j,this.#e(j,`Live SRT · ${x.published.length}/${v} đoạn · ${T.length} cue · ${D}`)}let B=x.flush();if(B.length===0)throw new lt("ASR hoàn tất nhưng không trả phụ đề.");y=B}finally{await ut(0);for(let I=0;;I++)try{Tt.rmSync(u,{recursive:!0,force:!0,maxRetries:3,retryDelay:100});break}catch(R){let v=R?.code;if((v==="EBUSY"||v==="EPERM"||v==="ENOTEMPTY")&&I<8){await ut(120);continue}break}}let $=performance.now()/1e3-r,_=[...S.keys()].sort((I,R)=>I-R).map(I=>S.get(I)),P=br({product:"ASRStudio UltraX (NodeJS)",version:Zo,input:String(o),output:String(s),model:i,jianying_app_version:l,providers_by_chunk:_,duration_seconds:h,speed:m,scaled_duration_seconds:b?h:Math.round(h/m*1e3)/1e3,audio_physically_converted:b,simulated_subtitles:!b&&Math.abs(m-1)>1e-6,audio_speed:m,chunk_seconds:U.CHUNK_CORE_S,overlap_seconds:U.OVERLAP_S,audio_kind:p.kind,audio_codec:p.track.codec??null,audio_passthrough:!0,chunks:x.published.length,parallel_workers:d,cues:y.length,elapsed_seconds:Math.round($*1e3)/1e3,live_atomic_srt:!0,jianying_first:!0,no_fallback:!0,netflix_single_line:!0,netflix_max_chars:t.maxChars??42,netflix_cps:t.cps??20,netflix_warnings:x.warnings,metrics:q.snapshotDelta(n),fidelity_note:"Server text/timestamps preserved in ORIGINAL modes. Unofficial cloud ASR cannot mathematically guarantee 99.99% WER; UltraX maximizes fidelity and eliminates client-side corruption."});if(!!!(t.srtOnly||t.noJunk)){if(E){let R=S.get(0)??"server";yr(Ft(s,".raw.json"),R,y)}Sr(Ft(s,".json"),P);let I=t.formats||["srt"];(I.includes("vtt")||I.includes("all"))&&st(Ft(s,".vtt"),vr(y)),(I.includes("lrc")||I.includes("all"))&&st(Ft(s,".lrc"),Ar(y)),(I.includes("txt")||I.includes("all"))&&st(Ft(s,".txt"),Er(y))}let M=m!==1?` (${m}x)`:"";return this.#e(100,E?`Hoàn tất · giữ nguyên timestamp server${M}`:`Hoàn tất · timeline đã kiểm tra${M}`),pn({outputPath:s,segments:y,language:t.language||"auto",languageProbability:0,elapsed:$,speed:m})}};function Ft(e,t){let n=Ze.extname(e);return n?e.slice(0,-n.length)+t:e+t}c(Ft,"replaceSuffix");function kr(e){return e instanceof X&&e.retryable&&e.phase==="rate"}c(kr,"isLocalRateLimit");function ts(e){return Array.isArray(e)?e.map(t=>Ce({start:t.startMs/1e3,end:t.endMs/1e3,text:t.text})):null}c(ts,"toWordTimeline");function es(e,t){let n=ts(e);return n?n.map(r=>Ce({start:r.start+t,end:r.end+t,text:r.text})):null}c(es,"toShiftedWordTimeline");var yt=Number.parseInt(process.env.ASR_GUI_PORT??"8760",10);if(!Number.isInteger(yt)||yt<=0||yt>65535)throw new f(`ASR_GUI_PORT không hợp lệ: ${process.env.ASR_GUI_PORT}`);var Ee=(process.env.ASR_GUI_HOST??"127.0.0.1").trim()||"127.0.0.1",Ie=/\.(wav|mp3|m4a|flac|ogg|aac|opus|mp4|mkv|mov|avi|webm|wmv|ts|m4v)$/i,os=/\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i,ss=Object.freeze({".mp4":"video/mp4",".m4v":"video/mp4",".webm":"video/webm",".mov":"video/quicktime",".mkv":"video/x-matroska",".avi":"video/x-msvideo",".wmv":"video/x-ms-wmv",".ts":"video/mp2t",".mp3":"audio/mpeg",".m4a":"audio/mp4",".aac":"audio/aac",".wav":"audio/wav",".flac":"audio/flac",".ogg":"audio/ogg",".opus":"audio/ogg"}),W={running:!1,activeJobs:new Map,token:null,startedAtMs:0,lastProgress:0,cueCount:0,lastOutput:"",lastBrowsedDir:process.cwd(),uploadTempDir:null,clients:new Set},is=100,Tr=1<<20,as=15e3;function cs(){return(!W.uploadTempDir||!Z.existsSync(W.uploadTempDir))&&(W.uploadTempDir=Z.mkdtempSync(V.join(tn.tmpdir(),"asr-gui-stage-"))),W.uploadTempDir}c(cs,"ensureUploadTempDir");function ls(){if(W.uploadTempDir){try{Z.rmSync(W.uploadTempDir,{recursive:!0,force:!0})}catch{}W.uploadTempDir=null}}c(ls,"cleanupUploadTempDir");process.once("exit",ls);function Ae(e,t){let n=`event: ${e}
data: ${JSON.stringify(t)}

`;for(let r of W.clients)try{if(r.destroyed||r.writableLength>1e6){try{r.destroy()}catch{}W.clients.delete(r);continue}r.write(n)||r.once("drain",()=>{})}catch{try{r.destroy()}catch{}W.clients.delete(r)}}c(Ae,"broadcast");function us(){for(let e of W.clients)try{if(e.destroyed||e.writableLength>1e6){try{e.destroy()}catch{}W.clients.delete(e);continue}e.write(`: ping

`)}catch{try{e.destroy()}catch{}W.clients.delete(e)}}c(us,"heartbeatTick");var fs=`<option value="${St}" selected>JianYing ORIGINAL 1:1 · Real Dữ Liệu Gốc 100.00% (Zero-Touch)</option>`,ds=`<!DOCTYPE html>
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
      <span class="badge-mono" id="queueStatsBadge">TỔNG: 0 | SONG SONG: 0 | XONG: 0</span>
    </div>
  </div>

  <div class="workstation-grid">
    <!-- CỘT TRÁI: NGUỒN MEDIA & CẤU HÌNH TỐC ĐỘ / LUỒNG -->
    <div class="panel">
      <div class="section-title">1. Nguồn Media & Thêm Hàng Loạt (Hỗ trợ 100+ file)</div>

      <div class="row">
        <input id="pathInput" type="text" placeholder="Dán đường dẫn file hoặc thư mục chứa nhiều video/audio…" style="flex:1" onkeydown="if(event.key==='Enter')applyPathInput()">
        <button onclick="applyPathInput()">Thêm</button>
        <button onclick="openFs()">Duyệt…</button>
      </div>

      <input id="filePicker" type="file" multiple accept="video/*,audio/*,.mp4,.mkv,.mov,.avi,.webm,.wmv,.ts,.m4v,.mp3,.m4a,.wav,.flac,.ogg,.aac,.opus" style="display:none" onchange="onFilePicked(this.files)">
      <div id="dropZone" onclick="document.getElementById('filePicker').click()">
        <div id="dropTitle">Kéo thả đồng thời lên tới 100+ Video / Âm Thanh vào đây</div>
        <div class="muted">Hỗ trợ nạp hàng loạt 100+ file MP4, MKV, MOV, MP3, M4A, WAV, FLAC · Xử lý song song 100% cùng lúc không cần hàng đợi</div>
      </div>

      <!-- ĐIỀU KHIỂN TỐC ĐỘ & SỐ LUỒNG SONG SONG -->
      <div class="speed-box">
        <div class="speed-header">
          <div>
            <div class="section-title" style="color:var(--text)">2. Tốc Độ & Luồng Song Song</div>
            <div class="muted">Tốc độ ASR & chế độ xử lý song song</div>
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
            <option value="all" selected>⚡ Toàn bộ song song 100% · Không hàng đợi (Kể cả 100+ file cùng lúc)</option>
            <option value="100">100 file song song cùng lúc</option>
            <option value="50">50 file song song cùng lúc</option>
            <option value="20">20 file song song cùng lúc</option>
            <option value="10">10 file song song cùng lúc</option>
            <option value="6">6 file song song</option>
            <option value="4">4 file song song</option>
            <option value="2">2 file song song</option>
            <option value="1">1 file tuần tự</option>
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
        <div class="section-title">3. Xử Lý Song Song Toàn Bộ (Song Song 100% Cùng Lúc · Không Cần Hàng Đợi)</div>
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
        <button id="start" class="btn-primary" style="flex:2;height:42px;font-size:13.5px" onclick="startBatch()">BẮT ĐẦU XỬ LÝ TOÀN BỘ CÙNG LÚC (SONG SONG 100% · SRT ONLY)</button>
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
                Danh sách trống. Kéo thả hàng loạt 100+ file media hoặc bấm "Duyệt…" để xử lý song song cùng lúc.
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
  <div class="row" style="margin-bottom:6px;gap:8px">
    <button class="btn-sm" onclick="fsUp()">↑ Lên thư mục cha</button>
    <button class="btn-sm btn-primary" onclick="fsAddAllMedia()">+ Thêm Tất Cả Media Trong Thư Mục Này</button>
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
  queueStatsBadge.textContent = "TỔNG: " + total + " | SONG SONG: " + running + " | XONG: " + done;
  if (total > 0) {
    const totalProgress = queue.reduce((acc, j) => acc + (j.progress || 0), 0) / total;
    bar.style.width = Math.round(totalProgress) + "%";
    pctReadout.textContent = Math.round(totalProgress) + "%";
  } else {
    bar.style.width = "0%";
    pctReadout.textContent = "0%";
  }
}

let renderScheduled = false;
function scheduleRenderQueue() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderQueue();
    updateStats();
  });
}

function renderQueue() {
  if (queue.length === 0) {
    queueBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px 12px;color:var(--muted)">Danh sách trống. Kéo thả hàng loạt 100+ file media hoặc bấm "Duyệt…" để xử lý song song cùng lúc.</td></tr>';
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
  const fileList = Array.from(files);
  appendLog("Đang nạp " + fileList.length + " file media vào hệ thống song song…");
  await Promise.all(fileList.map(async (file) => {
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
  }));
  scheduleRenderQueue();
  if (isBatchRunning) {
    pumpBatchWorkers();
  }
}

async function applyPathInput() {
  const val = document.getElementById("pathInput").value.trim().replace(/^["']|["']$/g, "");
  if (!val) return;
  try {
    const info = await api("/api/probe-file?path=" + encodeURIComponent(val));
    if (info.isDir) {
      if (info.files && info.files.length) {
        for (const f of info.files) {
          addQueueItem(f.path, f.name, f.size || 0);
        }
        appendLog("Đã nạp " + info.files.length + " file media từ thư mục: " + info.path);
      } else {
        alert("Thư mục không chứa file media hỗ trợ.");
      }
    } else {
      addQueueItem(info.path, info.name, info.size || 0);
    }
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
  while (log.childElementCount > 500) {
    log.removeChild(log.firstChild);
  }
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
      scheduleRenderQueue();
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
      activeWorkersCount--;
      scheduleRenderQueue();
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
      activeWorkersCount--;
      scheduleRenderQueue();
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
      activeWorkersCount--;
      scheduleRenderQueue();
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

function getConcurrency() {
  const el = document.getElementById("concurrency");
  if (!el || el.value === "all") return 999999;
  return parseInt(el.value, 10) || 999999;
}

function startBatch() {
  if (queue.length === 0) {
    const manualPath = document.getElementById("pathInput").value.trim().replace(/^["']|["']$/g, "");
    if (manualPath) {
      applyPathInput().then(() => startBatch());
      return;
    }
    alert("Hãy thêm ít nhất một file media.");
    return;
  }
  isBatchRunning = true;
  document.getElementById("start").disabled = true;
  document.getElementById("cancel").disabled = false;
  statusEl.textContent = "Đang xử lý song song toàn bộ file cùng lúc…";
  liveBadge.textContent = "100% SONG SONG CÙNG LÚC";

  pumpBatchWorkers();
}

async function pumpBatchWorkers() {
  if (!isBatchRunning) return;
  const concurrency = getConcurrency();

  const idleJobs = queue.filter((j) => j.status === "IDLE");
  if (idleJobs.length === 0) {
    if (activeWorkersCount === 0) {
      isBatchRunning = false;
      document.getElementById("start").disabled = false;
      document.getElementById("cancel").disabled = true;
      statusEl.textContent = "Toàn bộ file đã hoàn tất 100%!";
      liveBadge.textContent = "ORIGINAL 1:1 · ZERO-TOUCH";
      appendLog("[HOÀN TẤT] Toàn bộ " + queue.length + " file đã xử lý xong!");
    }
    return;
  }

  const toStart = idleJobs.slice(0, Math.max(0, concurrency - activeWorkersCount));
  if (toStart.length === 0) return;

  for (const nextJob of toStart) {
    nextJob.status = "RUNNING";
    nextJob.statusText = "Đang bắt đầu song song…";
    nextJob.progress = 0;
    activeWorkersCount++;

    (async (job) => {
      try {
        await api("/api/start", {
          jobId: job.id,
          input: job.path,
          speed: job.speed || currentSpeed,
        });
      } catch (err) {
        job.status = "ERROR";
        job.statusText = "Lỗi khởi tạo: " + err.message;
        job.error = err.message;
        appendLog("[LỖI " + job.id + "] " + err.message);
        activeWorkersCount--;
        scheduleRenderQueue();
        pumpBatchWorkers();
      }
    })(nextJob);
  }

  scheduleRenderQueue();
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
  scheduleRenderQueue();
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
let currentFsMediaEntries = [];
async function openFs() {
  await loadFs("");
  document.getElementById("fsDialog").showModal();
}

async function loadFs(p) {
  const data = await api("/api/fs?path=" + encodeURIComponent(p));
  document.getElementById("fsPath").textContent = data.path;
  currentFsParent = data.parent || data.path;
  currentFsMediaEntries = (data.entries || []).filter((e) => !e.dir);

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

function fsAddAllMedia() {
  if (!currentFsMediaEntries || !currentFsMediaEntries.length) {
    alert("Không tìm thấy file media nào trong thư mục này.");
    return;
  }
  for (const entry of currentFsMediaEntries) {
    addQueueItem(entry.path, entry.name, entry.size);
  }
  document.getElementById("fsDialog").close();
  appendLog("Đã nạp " + currentFsMediaEntries.length + " file media từ thư mục vào hệ thống.");
}

setSpeed(1.0);
</script>
</body>
</html>`;function Cr(e){let t=String(e??"").toLowerCase();return t==="127.0.0.1"||t==="localhost"||t==="::1"||t==="[::1]"||t===Ee.toLowerCase()}c(Cr,"isLoopbackHost");function hs(e){let t=String(e.headers.host??"").trim();if(!t)return!1;let n;try{n=new URL(`http://${t}`)}catch{return!1}if(!Cr(n.hostname)||n.port!==String(yt))return!1;let r=e.headers.origin;if(r==null)return!0;try{let o=new URL(r);return Cr(o.hostname)&&o.port===String(yt)}catch{return!1}}c(hs,"sameOriginGuard");function Q(e,t,n){e.writeHead(t,{"Content-Type":"application/json; charset=utf-8"}),e.end(JSON.stringify(n))}c(Q,"json");function Rr(){let e=[{label:"Thư mục dự án",path:process.cwd()}],t=tn.homedir();if(t&&Z.existsSync(t)){e.push({label:"Home",path:t});for(let n of["Downloads","Videos","Desktop"]){let r=V.join(t,n);Z.existsSync(r)&&e.push({label:n,path:r})}}if(process.platform==="win32")for(let n of["C","D","E","F","G"]){let r=`${n}:\\`;Z.existsSync(r)&&e.push({label:`Ổ ${n}:`,path:r})}else e.push({label:"/",path:"/"});return e}c(Rr,"discoverRoots");function ps(e){let t=W.lastBrowsedDir&&Z.existsSync(W.lastBrowsedDir)?W.lastBrowsedDir:process.cwd(),n=t;try{if(typeof e=="string"&&e.trim()){let s=V.resolve(e.trim());try{n=Z.statSync(s).isDirectory()?s:V.dirname(s)}catch{n=Z.existsSync(s)?s:t}}W.lastBrowsedDir=n;let r=V.dirname(n),o=Z.readdirSync(n,{withFileTypes:!0}).filter(s=>s.isDirectory()||Ie.test(s.name)).map(s=>{let i=V.join(n,s.name),a=0;if(!s.isDirectory())try{a=Z.statSync(i).size}catch{a=0}return{name:s.name,dir:s.isDirectory(),path:i,size:a}}).sort((s,i)=>s.dir===i.dir?s.name.localeCompare(i.name):s.dir?-1:1).slice(0,500);return{path:n,parent:r,roots:Rr(),entries:o}}catch(r){return{path:n,parent:V.dirname(n),roots:Rr(),entries:[],error:r?.message??String(r)}}}c(ps,"listDir");function Me(e){try{let t=zt(e);return Number.isFinite(t?.durationS)&&t.durationS>0?t.durationS:0}catch{return 0}}c(Me,"probeMediaDurationS");function ms(e,t){let n=V.basename(String(e??"").trim());if(!n||!Number.isFinite(t)||t<=0)return{found:!1};let r=tn.homedir(),o=[W.lastBrowsedDir,process.cwd(),r?V.join(r,"Downloads"):"",r?V.join(r,"Videos"):"",r?V.join(r,"Desktop"):"",r?V.join(r,"Music"):"",r||""].filter(Boolean),s=new Set;for(let i of o){let a=V.resolve(i,n);if(!s.has(a)){s.add(a);try{let l=Z.statSync(a);if(l.isFile()&&l.size===t)return{found:!0,path:a,durationS:Me(a)}}catch{}}}return{found:!1}}c(ms,"resolveLocalFileByNameSize");function gs(e,t,n){let r=String(n??"").trim();if(!r){Q(t,400,{error:"Thiếu đường dẫn media"});return}let o=V.resolve(r);if(!Ie.test(o)){Q(t,403,{error:"Định dạng file không nằm trong danh sách media cho phép"});return}let s;try{s=Z.statSync(o)}catch{Q(t,404,{error:"Không tìm thấy file media"});return}if(!s.isFile()){Q(t,404,{error:"Không phải file hợp lệ"});return}let i=s.size,a=V.extname(o).toLowerCase(),l=ss[a]??(os.test(a)?"audio/mpeg":"video/mp4"),u=e.headers.range;if(u){let h=/^bytes=(\d*)-(\d*)$/i.exec(String(u).trim());if(!h){t.writeHead(416,{"Content-Range":`bytes */${i}`}),t.end();return}let b=h[1]?Number.parseInt(h[1],10):0,m=h[2]?Number.parseInt(h[2],10):i-1;if(!h[1]&&h[2]){let E=Number.parseInt(h[2],10);b=Math.max(0,i-E),m=i-1}if(b>=i||m>=i||b>m){t.writeHead(416,{"Content-Range":`bytes */${i}`}),t.end();return}let g=m-b+1;t.writeHead(206,{"Content-Range":`bytes ${b}-${m}/${i}`,"Accept-Ranges":"bytes","Content-Length":g,"Content-Type":l,"Cache-Control":"no-store"});let A=Z.createReadStream(o,{start:b,end:m});A.on("error",()=>{try{t.destroy()}catch{}}),e.on("close",()=>{try{A.destroy()}catch{}}),A.pipe(t);return}t.writeHead(200,{"Accept-Ranges":"bytes","Content-Length":i,"Content-Type":l,"Cache-Control":"no-store"});let p=Z.createReadStream(o);p.on("error",()=>{try{t.destroy()}catch{}}),e.on("close",()=>{try{p.destroy()}catch{}}),p.pipe(t)}c(gs,"serveMediaRange");async function ws(e){if(W.running)throw new f("Một job đang chạy — hủy hoặc chờ hoàn tất");let t=String(e?.input??"").trim();if(!t)throw new f("Thiếu đường dẫn input");let n=null;try{n=Z.statSync(t)}catch{throw new f(`Không tìm thấy file: ${t}`)}if(!n.isFile())throw new f(`Không tìm thấy file: ${t}`);let r=V.extname(t),s=(typeof e?.output=="string"?e.output.trim():"")||(r?t.slice(0,-r.length)+".srt":t+".srt"),i=V.resolve(t),a=V.resolve(s);if(!a||a===i)throw new f(`Đường dẫn output không hợp lệ: ${s}`);try{if(!Z.statSync(V.dirname(a)).isDirectory())throw new f(`Thư mục output không hợp lệ: ${V.dirname(a)}`)}catch(g){throw g instanceof f?g:new f(`Thư mục output không tồn tại: ${V.dirname(a)}`)}let l=e?.model===kt?kt:St,u=Number.isInteger(e?.workers)&&e.workers>0?Math.min(e.workers,16):null,p=mt;if(e?.speed!==void 0&&e?.speed!==null)try{p=gt(Number(e.speed))}catch{throw new f(`Tốc độ (speed) phải nằm trong khoảng [${_t}, ${Nt}]`)}let h=String(e?.jobId||"job-"+Date.now()+"-"+Math.random().toString(36).slice(2,7)),b=new Pt,m={id:h,input:i,output:a,token:b,startedAtMs:performance.now(),lastProgress:0,cueCount:0};return W.activeJobs.set(h,m),W.running=!0,W.token=b,(async()=>{try{let g=await new xe(b,(A,E)=>{m.lastProgress=Rn(m.lastProgress,A),W.lastProgress=m.lastProgress,Ae("progress",{jobId:h,value:m.lastProgress,message:E})}).run(Re({inputPath:i,outputPath:a,model:l,language:null,jianyingAppVersion:"10.9.0",maxWorkers:u,speed:p,physicalSpeed:!1,formats:["srt"],srtOnly:!0,noJunk:!0}));m.cueCount=g.segments.length,W.lastOutput=g.outputPath,Ae("done",{jobId:h,cues:g.segments.length,elapsed:g.elapsed,output:g.outputPath,speed:g.speed,eta:de(g.elapsed,1),throughput:Cn(g.segments.length,g.elapsed)})}catch(g){te(g)?Ae("cancelled",{jobId:h}):Ae("failed",{jobId:h,error:g instanceof f?g.describe():g?.stack??String(g)})}finally{W.activeJobs.delete(h),W.running=W.activeJobs.size>0,W.running||(W.token=null)}})(),{ok:!0,jobId:h,speed:p,output:a}}c(ws,"startJob");function bs({openBrowser:e=!0}={}){let t=ns.createServer(async(n,r)=>{let o=new URL(n.url,`http://${Ee}:${yt}`);try{if(!hs(n)){Q(r,403,{error:"forbidden"});return}if(o.pathname==="/events"){if(W.clients.size>=is){Q(r,503,{error:"Quá nhiều client SSE — thử lại sau"});return}r.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive"}),r.write(`: connected

`),r.on("error",()=>W.clients.delete(r)),W.clients.add(r),n.on("close",()=>W.clients.delete(r));return}if(o.pathname==="/api/start"&&n.method==="POST"){if(!String(n.headers["content-type"]??"").includes("application/json")){Q(r,415,{error:"Content-Type phải là application/json"});return}let i=Number.parseInt(String(n.headers["content-length"]??""),10);if(Number.isFinite(i)&&i>Tr){Q(r,413,{error:"POST body quá lớn (giới hạn 1MB)"});try{n.resume()}catch{}return}let a=[],l=0,u=!1;for await(let b of n){if(l+=b.length,l>Tr){u=!0;break}a.push(b)}if(u){Q(r,413,{error:"POST body quá lớn (giới hạn 1MB)"});return}let p;try{p=JSON.parse(Buffer.concat(a).toString("utf8")||"{}")}catch{Q(r,400,{error:"JSON không hợp lệ"});return}let h=await ws(p);Q(r,200,h);return}if(o.pathname==="/api/cancel"&&n.method==="POST"){let s=null;try{let i=[];for await(let a of n)i.push(a);i.length&&(s=JSON.parse(Buffer.concat(i).toString("utf8")||"{}").jobId)}catch{}if(s&&W.activeJobs.has(s))W.activeJobs.get(s)?.token?.cancel();else{for(let i of W.activeJobs.values())i.token?.cancel();W.token?.cancel()}Q(r,200,{ok:!0});return}if(o.pathname==="/api/fs"){Q(r,200,ps(o.searchParams.get("path")??""));return}if(o.pathname==="/api/probe-file"){let s=String(o.searchParams.get("path")??"").trim();if(!s){Q(r,400,{error:"Thiếu đường dẫn file"});return}let i=V.resolve(s),a;try{a=Z.statSync(i)}catch{Q(r,404,{error:`Không tìm thấy file: ${s}`});return}if(a.isDirectory()){let l=Z.readdirSync(i,{withFileTypes:!0}).filter(u=>!u.isDirectory()&&Ie.test(u.name)).map(u=>{let p=V.join(i,u.name),h=0;try{h=Z.statSync(p).size}catch{}return{path:p,name:u.name,size:h,durationS:Me(p)}});W.lastBrowsedDir=i,Q(r,200,{isDir:!0,path:i,files:l,durationS:0});return}if(!a.isFile()){Q(r,400,{error:`Đường dẫn không phải là file: ${s}`});return}W.lastBrowsedDir=V.dirname(i),Q(r,200,{isDir:!1,path:i,name:V.basename(i),size:a.size,durationS:Me(i)});return}if(o.pathname==="/api/resolve-file"){let s=o.searchParams.get("name")??"",i=Number.parseInt(o.searchParams.get("size")??"0",10);Q(r,200,ms(s,i));return}if(o.pathname==="/api/upload"&&n.method==="POST"){let i=V.basename(String(o.searchParams.get("name")??"media.mp4").trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g,"_")||"media.mp4";if(!Ie.test(i)){Q(r,400,{error:`Định dạng file không hỗ trợ: ${i}`}),n.resume();return}let a=cs(),l=V.join(a,i);await new Promise((u,p)=>{let h=Z.createWriteStream(l);n.pipe(h),h.on("finish",u),h.on("error",p),n.on("error",p)}),Q(r,200,{ok:!0,path:l,name:i,durationS:Me(l)});return}if(o.pathname==="/api/media"&&n.method==="GET"){gs(n,r,o.searchParams.get("path")??"");return}if(o.pathname==="/api/srt"&&n.method==="GET"){let s=String(o.searchParams.get("path")??W.lastOutput??"").trim();if(!s){Q(r,404,{error:"Chưa có file SRT"});return}let i=V.resolve(s);if(!i.toLowerCase().endsWith(".srt")||!Z.existsSync(i)){Q(r,404,{error:"Không tìm thấy file SRT"});return}let a=o.searchParams.get("download")==="1",l=V.basename(i);r.writeHead(200,{"Content-Type":"text/plain; charset=utf-8",...a?{"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(l)}`}:{}}),Z.createReadStream(i).pipe(r);return}if(o.pathname==="/"){r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}),r.end(ds.replace("${MODELS_OPTIONS}",fs));return}Q(r,404,{error:"not found"})}catch(s){Q(r,400,{error:s instanceof f?s.describe():String(s?.message??s)})}});return new Promise((n,r)=>{t.on("error",s=>{r(new f(s?.code==="EADDRINUSE"?`Port ${yt} đang bị chiếm — đặt ASR_GUI_PORT=<port khác>`:`GUI server lỗi: ${s?.message??s}`))});let o=setInterval(us,as);try{o.unref?.()}catch{}t.on("close",()=>clearInterval(o)),t.listen(yt,Ee,()=>{let s=`http://${Ee}:${yt}`;if(process.stdout.write(`ASR Studio UltraX GUI · ${s}
`),e)try{let i=!1;if(process.platform==="win32"){let a=["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",V.join(process.env.LOCALAPPDATA||"","Google\\Chrome\\Application\\chrome.exe"),"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];for(let l of a)if(l&&Z.existsSync(l)){let u=ve(l,[`--app=${s}`],{detached:!0,stdio:"ignore"});u.on("error",()=>{}),u.unref?.(),i=!0;break}if(!i){let l=ve("cmd",["/c","start","",s],{detached:!0,stdio:"ignore"});l.on("error",()=>{}),l.unref?.()}}else if(process.platform==="darwin"){let a=ve("open",[s],{detached:!0,stdio:"ignore"});a.on("error",()=>{}),a.unref?.()}else{let a=ve("xdg-open",[s],{detached:!0,stdio:"ignore"});a.on("error",()=>{}),a.unref?.()}}catch{}n(t)})})}c(bs,"startGui");async function Ss(){await bs({openBrowser:process.env.ASR_GUI_NO_OPEN!=="1"}),setInterval(()=>{},1<<30)}c(Ss,"main");process.argv[1]&&import.meta.url===rs(process.argv[1]).href&&Ss();export{Ss as main,bs as startGui};
//# sourceMappingURL=gui.bundle.mjs.map
