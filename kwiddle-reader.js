"use strict";
(() => {
 const OWNER="cloudberrypitech",REPO="kwiddle",BRANCH="main",BOOK_DIR="src/kwiddle/books";
 const API=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${BOOK_DIR}?ref=${BRANCH}`;
 const RAW=`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;
 const $=id=>document.getElementById(id);
 let books=[],current=-1,scale=17,searchMatches=[],matchIndex=0,activeFonts=new Set(),imageUrls=[],styleRegistry=new Map(),defaultStyles=new Map(),listStyleRegistry=new Map(),fontFaceRegistry=new Map(),footnotes=[];
 const progressKey="kwiddle-reader-progress-v1";
 function cookieValue(name){const prefix=encodeURIComponent(name)+"=";const item=document.cookie.split("; ").find(part=>part.startsWith(prefix));return item?decodeURIComponent(item.slice(prefix.length)):null}
 function syncSiteTheme(){
  const theme=cookieValue("theme")==="light"?"light":"dark";
  const accent=cookieValue("accent");
  document.documentElement.dataset.theme=theme;
  if(accent&&/^#[0-9a-f]{6}$/i.test(accent))document.documentElement.style.setProperty("--accent",accent);
  $("theme").value=theme;
 }
 syncSiteTheme();
 function safeName(path){return path.split("/").pop().replace(/\.odt$/i,"").replace(/[_-]+/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
 function setStatus(s){$("syncStatus").textContent=s}
 async function loadBooks(keep=true){
  const old=current>=0?books[current]?.name:null;setStatus("Checking Kwiddle repository…");
  try{
   const response=await fetch(API+(API.includes("?")?"&":"?")+"_="+Date.now(),{cache:"no-store",headers:{"Accept":"application/vnd.github+json","Cache-Control":"no-cache"}});
   if(!response.ok)throw Error("GitHub returned "+response.status);
   const data=await response.json();
   books=data.filter(x=>x.type==="file"&&x.name.toLowerCase().endsWith(".odt")&&!x.name.startsWith(".~")).map(x=>({name:x.name,title:safeName(x.name),url:RAW+BOOK_DIR+"/"+encodeURIComponent(x.name)+"?v="+encodeURIComponent(x.sha),size:x.size,sha:x.sha})).sort((a,b)=>a.title.localeCompare(b.title));
   renderList();$("count").textContent="("+books.length+")";
   setStatus("Synced from "+OWNER+"/"+REPO+" · "+new Date().toLocaleTimeString());
   if(keep&&old){const n=books.findIndex(b=>b.name===old);if(n>=0){await openBook(n);return}}
   if(current>=books.length)current=-1;
  }catch(e){setStatus("Could not sync book list: "+e.message+". Check your connection and retry.");if(!books.length)$("bookList").innerHTML='<p class="status">Unable to load books. The repository must be public.</p>'}
 }
 function renderList(){
  const q=$("bookSearch").value.toLowerCase();$("bookList").replaceChildren();
  const visible=books.map((b,i)=>({...b,i})).filter(b=>b.title.toLowerCase().includes(q)||b.name.toLowerCase().includes(q));
  if(!visible.length){$("bookList").innerHTML='<p class="status">No matching ODT books found.</p>';return}
  visible.forEach(b=>{const button=document.createElement("button");button.className="book"+(b.i===current?" active":"");button.innerHTML="";const title=document.createElement("span");title.textContent=b.title;const small=document.createElement("small");small.textContent=(b.size/1024).toFixed(1)+" KB · ODT";button.append(title,small);button.addEventListener("click",()=>openBook(b.i));$("bookList").append(button)})
 }
 function xmlText(node){return Array.from(node.childNodes).map(n=>n.nodeType===3?n.nodeValue:n.nodeType===1?xmlText(n):"").join("")}
 function styleKey(family,name){return family+":"+name}
 function collectStyles(doc){
  styleRegistry=new Map();defaultStyles=new Map();listStyleRegistry=new Map();fontFaceRegistry=new Map();
  if(!doc)return;
  const all=Array.from(doc.getElementsByTagName("*"));
  for(const el of all){
   if(el.localName==="font-face"){
    const name=el.getAttribute("style:name");
    const family=el.getAttribute("svg:font-family")||el.getAttribute("style:font-family");
    if(name&&family)fontFaceRegistry.set(name,family.replace(/^["']|["']$/g,""));
   }
   if(el.localName==="list-style"){
    const name=el.getAttribute("style:name");
    if(name)listStyleRegistry.set(name,el);
   }
  }
  for(const el of all){
   if(el.localName!=="style"&&el.localName!=="default-style")continue;
   const family=el.getAttribute("style:family")||"";
   const name=el.getAttribute("style:name")||"";
   if(!family)continue;
   if(el.localName==="default-style"){defaultStyles.set(family,el);continue}
   if(name)styleRegistry.set(styleKey(family,name),el);
  }
 }
 function styleChain(el,family){
  const name=el.getAttribute("text:style-name")||el.getAttribute("draw:style-name")||el.getAttribute("table:style-name")||el.getAttribute("style:style-name");
  const chain=[];let current=name,guard=0;
  while(current&&guard++<20){const item=styleRegistry.get(styleKey(family,current));if(!item)break;chain.unshift(item);current=item.getAttribute("style:parent-style-name")}
  return chain;
 }
 function cssFromProperties(props,family){
  const out={};
  const copy=(from,to)=>{if(props.hasAttribute(from)){const v=props.getAttribute(from);if(v)out[to]=v}};
  copy("fo:font-family","font-family");copy("fo:font-size","font-size");copy("fo:font-weight","font-weight");copy("fo:font-style","font-style");copy("fo:color","color");copy("fo:background-color","background-color");
  copy("fo:text-align","text-align");copy("fo:text-align-last","text-align-last");copy("fo:margin-left","margin-left");copy("fo:margin-right","margin-right");copy("fo:margin-top","margin-top");copy("fo:margin-bottom","margin-bottom");copy("fo:text-indent","text-indent");copy("fo:line-height","line-height");copy("fo:letter-spacing","letter-spacing");copy("fo:word-spacing","word-spacing");
  copy("fo:padding","padding");copy("fo:padding-left","padding-left");copy("fo:padding-right","padding-right");copy("fo:padding-top","padding-top");copy("fo:padding-bottom","padding-bottom");
  copy("fo:border","border");copy("fo:border-left","border-left");copy("fo:border-right","border-right");copy("fo:border-top","border-top");copy("fo:border-bottom","border-bottom");
  copy("fo:width","width");copy("fo:height","height");copy("fo:min-width","min-width");copy("fo:max-width","max-width");copy("fo:vertical-align","vertical-align");copy("fo:wrap-option","overflow-wrap");copy("fo:hyphenate","hyphens");
  copy("fo:direction","direction");copy("fo:writing-mode","writing-mode");copy("fo:display","display");
  const keep=props.getAttribute("fo:keep-with-next");if(keep==="always")out["break-after"]="avoid";
  const keepTogether=props.getAttribute("fo:keep-together");if(keepTogether==="always")out["break-inside"]="avoid";
  const breakBefore=props.getAttribute("fo:break-before");if(breakBefore==="page")out["break-before"]="page";else if(breakBefore==="column")out["break-before"]="column";
  const breakAfter=props.getAttribute("fo:break-after");if(breakAfter==="page")out["break-after"]="page";else if(breakAfter==="column")out["break-after"]="column";
  const underline=props.getAttribute("style:text-underline-style");if(underline&&underline!=="none")out["text-decoration"]=(out["text-decoration"]||"")+" underline";
  const strike=props.getAttribute("style:text-line-through-style");if(strike&&strike!=="none")out["text-decoration"]=(out["text-decoration"]||"")+" line-through";
  const bg=props.getAttribute("fo:background-color");if(bg==="transparent")delete out["background-color"];
  const familyName=props.getAttribute("style:font-name");if(familyName){const resolved=fontFaceRegistry.get(familyName)||familyName;out["font-family"]=resolved.includes(",")?resolved:JSON.stringify(resolved);activeFonts.add(resolved)}
  const textTransform=props.getAttribute("fo:text-transform");if(textTransform)out["text-transform"]=textTransform;
  if(family==="table-cell"){copy("fo:background-color","background-color");copy("style:vertical-align","vertical-align")}
  return out;
 }
 function styleMap(el,family){
  const merged={};
  const apply=style=>{
   for(const child of style.children){
    const part=cssFromProperties(child,family);
    Object.assign(merged,part);
   }
  };
  const defaults=defaultStyles.get(family);if(defaults)apply(defaults);
  styleChain(el,family).forEach(apply);
  const direct=cssFromProperties(el,family);Object.assign(merged,direct);
  if(merged["font-family"])activeFonts.add(merged["font-family"]);
  return Object.entries(merged).map(([k,v])=>k+":"+v).join(";");
 }
 function applyElementStyle(out,node,family){
  const css=styleMap(node,family);if(css)out.setAttribute("style",css);
 }
 function safeHref(href){
  if(!href)return null;
  try{const u=new URL(href,location.href);return ["http:","https:","mailto:"].includes(u.protocol)?u.href:null}catch{return null}
 }
 function frameImage(frame){
  const imageNode=frame.querySelector("image");
  if(!imageNode)return null;
  const href=imageNode.getAttribute("xlink:href")||imageNode.getAttributeNS("http://www.w3.org/1999/xlink","href");
  if(!href)return null;
  const img=document.createElement("img");
  img.dataset.odtPath=href;
  img.alt=imageNode.getAttribute("svg:title")||imageNode.getAttribute("svg:desc")||frame.getAttribute("svg:title")||frame.getAttribute("svg:desc")||frame.getAttribute("draw:name")||"Document image";
  const width=frame.getAttribute("svg:width"),height=frame.getAttribute("svg:height");
  if(width&&/^\s*\d+(?:\.\d+)?\s*(px|pt|cm|mm|in)?\s*$/i.test(width))img.style.width=width;
  if(height&&/^\s*\d+(?:\.\d+)?\s*(px|pt|cm|mm|in)?\s*$/i.test(height))img.style.height=height;
  const anchor=frame.getAttribute("text:anchor-type")||"as-char";
  img.className=anchor==="as-char"||anchor==="char"?"odt-inline-image":"odt-framed-image";
  applyElementStyle(img,frame,"graphic");
  img.title=img.alt;
  return img;
 }
 function appendFrame(frame,frag){
  const img=frameImage(frame);
  if(img){frag.append(img);return}
  const object=frame.querySelector("object,object-ole,plugin");
  const href=object?.getAttribute("xlink:href");
  if(href){
   const label=frame.getAttribute("draw:name")||"Embedded object";
   const base=href.split("/").pop().replace(/^\.\//,"");
   const preview=document.createElement("img");preview.dataset.odtPath="ObjectReplacements/"+base;preview.alt=label+" preview";preview.className="odt-framed-image";frag.append(preview);
   const link=document.createElement("a");link.textContent="Open "+label;link.dataset.odtObjectPath=href;link.className="odt-object-link";frag.append(link);
  }
  const shapeText=Array.from(frame.querySelectorAll("p,h")).map(el=>el.textContent).join(" ").trim();
  if(shapeText){const shape=document.createElement("span");shape.className="odt-shape-text";shape.textContent=shapeText;applyElementStyle(shape,frame,"graphic");frag.append(shape)}
 }
 function renderInline(node){
  const frag=document.createDocumentFragment();
  for(const n of node.childNodes){
   if(n.nodeType===3){frag.append(document.createTextNode(n.nodeValue));continue}
   if(n.nodeType!==1)continue;
   const tag=n.localName;let out;
   if(tag==="frame"){appendFrame(n,frag);continue}
   if(tag==="s"){const count=Math.max(1,Math.min(10000,Number(n.getAttribute("text:c")||1)));frag.append(document.createTextNode(" ".repeat(count)));continue}
   if(tag==="span"||tag==="a"||tag==="tab"||tag==="line-break"||tag==="bookmark"||tag==="bookmark-start"||tag==="bookmark-end"||tag==="reference-mark"||tag==="reference-mark-start"||tag==="reference-mark-end"){
    out=document.createElement(tag==="a"?"a":"span");
    const href=n.getAttribute("xlink:href");
    if(tag==="a"&&href){const safe=safeHref(href);if(safe){out.href=safe;out.target="_blank";out.rel="noopener noreferrer"}}
    const markName=n.getAttribute("text:name")||n.getAttribute("text:ref-name");
    if(markName&&/^[a-zA-Z][\w:.-]*$/.test(markName))out.id=markName;
    applyElementStyle(out,n,"text");
    if(tag==="tab")frag.append(document.createTextNode("\t"));
    else if(tag==="line-break")frag.append(document.createElement("br"));
    else if(tag==="bookmark-end"||tag==="reference-mark-end")continue;
    else{out.append(renderInline(n));frag.append(out)}
   }else if(tag==="note"){
    const note=document.createElement("sup");note.className="odt-note-marker";note.textContent=n.querySelector("note-citation")?.textContent||String(footnotes.length+1);note.title=Array.from(n.querySelectorAll("note-body p")).map(p=>p.textContent).join(" ");frag.append(note);
    const body=n.querySelector("note-body");if(body){const aside=document.createElement("aside");aside.className="odt-footnote";aside.append(renderInline(body));footnotes.push(aside)}
   }else if(tag==="tab"){frag.append(document.createTextNode("\t"))}
   else if(tag==="line-break"){frag.append(document.createElement("br"))}
   else if(tag==="soft-page-break"){const br=document.createElement("hr");br.className="odt-page-break";frag.append(br)}
   else if(["date","time","page-number","page-count","chapter","sequence","variable-get","user-field-get","database-display"].includes(tag)){
    out=document.createElement("span");out.className="odt-field";out.textContent=n.textContent||n.getAttribute("text:current-value")||"";frag.append(out)
   }else if(tag==="annotation"||tag==="annotation-end"||tag==="tracked-changes"||tag==="change-start"||tag==="change-end"){
    continue;
   }else if(tag==="object"||tag==="object-ole"||tag==="plugin"){
    const href=n.getAttribute("xlink:href");if(href){const link=document.createElement("a");link.textContent="Open embedded object";link.dataset.odtObjectPath=href;frag.append(link)}
   }else if(tag==="custom-shape"||tag==="rect"||tag==="ellipse"||tag==="line"||tag==="connector"||tag==="polygon"||tag==="polyline"||tag==="path"){
    const shape=document.createElement("span");shape.className="odt-shape-text";applyElementStyle(shape,n,"graphic");shape.append(renderInline(n));frag.append(shape)
   }else{frag.append(renderInline(n))}
  }
  return frag
 }
 function listNumber(value,format){
  if(format==="a"||format==="A"){
   let n=value,result="";while(n>0){n--;result=String.fromCharCode((format==="a"?97:65)+(n%26))+result;n=Math.floor(n/26)}return result;
  }
  if(format==="i"||format==="I"){
   let n=value,result="";for(const [amount,symbol] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]]){while(n>=amount){result+=symbol;n-=amount}}
   return format==="i"?result.toLowerCase():result;
  }
  return String(value);
 }
 function appendBlockStyle(el,node,family){applyElementStyle(el,node,family);const align=el.style.textAlign;if(align)el.dataset.align=align}
 function buildBlocks(root){
  const frag=document.createDocumentFragment();
  for(const n of root.children){
   const tag=n.localName;
   if(tag==="p"||tag==="h"){
    const level=Math.max(1,Math.min(6,Number(n.getAttribute("text:outline-level")||1)));
    const p=document.createElement(tag==="h"?"h"+level:"p");
    appendBlockStyle(p,n,"paragraph");p.append(renderInline(n));frag.append(p);
   }else if(tag==="list"){
    const styleName=n.getAttribute("text:style-name")||"";
    const style=listStyleRegistry.get(styleName);
    const levels=style?Array.from(style.children).filter(x=>x.localName.startsWith("list-level-style-")):[];
    const level=Number(n.getAttribute("text:level")||1);
    const definition=levels.find(x=>Number(x.getAttribute("text:level")||1)===level)||levels[0];
    const numbered=definition?definition.localName==="list-level-style-number":styleName.toLowerCase().includes("number");
    const list=document.createElement(numbered?"ol":"ul");
    if(styleName)list.dataset.odtStyle=styleName;
    const fmt=definition?.getAttribute("style:num-format")||"1";
    const prefix=definition?.getAttribute("style:num-prefix")||"";
    const suffix=definition?.getAttribute("style:num-suffix")||".";
    const startValue=Math.max(1,Number(definition?.getAttribute("text:start-value")||1)||1);
    const bulletChar=definition?.getAttribute("text:bullet-char")||"";
    const bulletHref=definition?.getAttribute("xlink:href")||"";
    const customMarker=numbered&&(prefix||suffix!=="."||!["1","a","A","i","I"].includes(fmt));
    if(numbered){
     const typeMap={"1":"decimal","a":"lower-alpha","A":"upper-alpha","i":"lower-roman","I":"upper-roman"};
     list.style.listStyleType=customMarker?"none":(typeMap[fmt]||"decimal");
     if(!customMarker&&startValue>1)list.start=startValue;
    }else if(bulletChar||bulletHref)list.style.listStyleType="none";
    let itemIndex=0;
    for(const item of n.children){
     if(item.localName!=="list-item"&&item.localName!=="list-header")continue;
     const li=document.createElement("li");
     if(customMarker){
      const mark=document.createElement("span");mark.className="odt-list-marker";mark.textContent=prefix+listNumber(startValue+itemIndex,fmt)+suffix+" ";li.append(mark);
     }else if(!numbered&&(bulletChar||bulletHref)){
      const mark=document.createElement("span");mark.className="odt-list-marker";
      if(bulletHref){const img=document.createElement("img");img.dataset.odtPath=bulletHref;img.alt="";mark.append(img)}else mark.textContent=bulletChar+" ";
      li.append(mark);
     }
     li.append(buildBlocks(item));list.append(li);itemIndex++;
    }
    frag.append(list);
   }else if(tag==="table"){
    const table=document.createElement("table");applyElementStyle(table,n,"table");
    const body=document.createElement("tbody");
    const rows=Array.from(n.children).flatMap(child=>child.localName==="table-header-rows"||child.localName==="table-rows"?Array.from(child.children).filter(row=>row.localName==="table-row"):(child.localName==="table-row"?[child]:[]));
    for(const row of rows){
     const tr=document.createElement("tr");applyElementStyle(tr,row,"table-row");
     for(const cell of row.children){
      if(!["table-cell","covered-table-cell"].includes(cell.localName))continue;
      const isHeader=cell.parentElement?.parentElement?.localName==="table-header-rows";
      const td=document.createElement(isHeader?"th":"td");applyElementStyle(td,cell,"table-cell");td.append(buildBlocks(cell));
      const span=cell.getAttribute("table:number-columns-spanned");if(span)td.colSpan=Math.max(1,Number(span));
      const rowSpan=cell.getAttribute("table:number-rows-spanned");if(rowSpan)td.rowSpan=Math.max(1,Number(rowSpan));tr.append(td)
     }body.append(tr)
    }table.append(body);frag.append(table);
   }else if(tag==="frame"){
    appendFrame(n,frag);
   }else if(["custom-shape","rect","ellipse","line","connector","polygon","polyline","path"].includes(tag)){
    const shape=document.createElement("figure");shape.className="odt-shape";applyElementStyle(shape,n,"graphic");
    const textContent=Array.from(n.querySelectorAll("p,h")).map(p=>p.textContent).join(" ").trim();
    if(textContent){const label=document.createElement("figcaption");label.textContent=textContent;shape.append(label)}
    frag.append(shape);
   }else if(tag==="g"){
    frag.append(buildBlocks(n));
   }else if(tag==="image"){
    const src=n.getAttribute("xlink:href");if(src){const image=document.createElement("img");image.alt="Document image";image.dataset.odtPath=src;applyElementStyle(image,n,"graphic");frag.append(image)}
   }else if(["section","div","list-item","list-header","table-cell","table-row"].includes(tag)){frag.append(buildBlocks(n))}
   else if(tag==="note"){
    const note=document.createElement("aside");note.className="odt-note";note.append(buildBlocks(n));frag.append(note)
   }
  }
  return frag

 function localElements(root,name){return Array.from(root?.getElementsByTagName("*")||[]).filter(el=>el.localName===name)}
 function readDocumentMeta(doc){
  const result={};
  const names=["title","subject","creator","description","date","language","keyword","creation-date"];
  for(const name of names){
   const node=localElements(doc,name)[0];
   if(node){const value=(node.textContent||"").trim();if(value)result[name]=value}
  }
  return result;
 }
 function pageMasterElements(doc){
  const masters=localElements(doc,"master-page");
  const master=masters[0]||null;
  if(!master)return {master:null,header:null,footer:null,props:null};
  const layoutName=master.getAttribute("style:page-layout-name");
  const layouts=localElements(doc,"page-layout");
  const layout=layouts.find(el=>el.getAttribute("style:name")===layoutName)||layouts[0]||null;
  const props=layout?Array.from(layout.children).find(el=>el.localName==="page-layout-properties"):null;
  const header=Array.from(master.children).find(el=>["header","header-left","header-first"].includes(el.localName))||null;
  const footer=Array.from(master.children).find(el=>["footer","footer-left","footer-first"].includes(el.localName))||null;
  return {master,header,footer,props};
 }
 function applyPageLayout(doc){
  const page=pageMasterElements(doc);
  const props=page.props;
  $("paper").style.width="";
  $("paper").style.minHeight="";
  $("paper").style.padding="";
  $("paper").style.backgroundColor="";
  if(props){
   const get=key=>props.getAttribute("fo:"+key)||"";
   const width=get("page-width"),height=get("page-height");
   const marginTop=get("margin-top"),marginRight=get("margin-right"),marginBottom=get("margin-bottom"),marginLeft=get("margin-left");
   const valid=value=>/^\s*\d+(?:\.\d+)?\s*(px|pt|cm|mm|in|%)?\s*$/i.test(value);
   if(width&&valid(width))$("paper").style.width="min(100%, "+width.trim()+")";
   if(height&&valid(height))$("paper").style.minHeight=height.trim();
   if([marginTop,marginRight,marginBottom,marginLeft].some(Boolean)){
    const values=[marginTop||"2cm",marginRight||"2cm",marginBottom||"2cm",marginLeft||"2cm"];
    if(values.every(valid))$("paper").style.padding=values.join(" ");
   }
   const bg=get("background-color");if(bg&&/^(#[0-9a-f]{3,8}|[a-z]+|rgb[a]?\([0-9,.\s%]+\))$/i.test(bg))$("paper").style.backgroundColor=bg;
  }
  return page;
 }
 } async function openBook(index){
  if(index<0||index>=books.length)return;current=index;renderList();$("prev").disabled=index===0;$("next").disabled=index===books.length-1;
  $("paper").innerHTML='<div class="empty">Opening '+books[index].title+'…</div>';$("fontInfo").textContent="";activeFonts.clear();imageUrls.forEach(URL.revokeObjectURL);imageUrls=[];
  try{
   const response=await fetch(books[index].url,{cache:"no-store",headers:{"Cache-Control":"no-cache"}});if(!response.ok)throw Error("Download failed ("+response.status+")");
   const zip=await JSZip.loadAsync(await response.arrayBuffer());const xmlFile=zip.file("content.xml");if(!xmlFile)throw Error("This ODT has no content.xml file");
   const xml= new DOMParser().parseFromString(await xmlFile.async("text"),"application/xml");if(xml.querySelector("parsererror"))throw Error("Invalid ODT XML");
   footnotes=[];collectStyles(xml);
   let stylesXml=null;
   const stylesFile=zip.file("styles.xml");
   if(stylesFile){
    stylesXml=new DOMParser().parseFromString(await stylesFile.async("text"),"application/xml");
    if(!stylesXml.querySelector("parsererror")){
     const contentStyles=styleRegistry,contentDefaults=defaultStyles,contentLists=listStyleRegistry,contentFonts=fontFaceRegistry;
     collectStyles(stylesXml);
     for(const [k,v] of contentStyles)if(!styleRegistry.has(k))styleRegistry.set(k,v);
     for(const [k,v] of contentDefaults)if(!defaultStyles.has(k))defaultStyles.set(k,v);
     for(const [k,v] of contentLists)if(!listStyleRegistry.has(k))listStyleRegistry.set(k,v);
     for(const [k,v] of contentFonts)if(!fontFaceRegistry.has(k))fontFaceRegistry.set(k,v);
    }else stylesXml=null;
   }
   const pageInfo=applyPageLayout(stylesXml);
   const metaFile=zip.file("meta.xml");
   let documentMeta={};
   if(metaFile){const metaXml=new DOMParser().parseFromString(await metaFile.async("text"),"application/xml");if(!metaXml.querySelector("parsererror"))documentMeta=readDocumentMeta(metaXml)}
   const body=xml.getElementsByTagName("office:body")[0]?.firstElementChild;if(!body)throw Error("No readable document body found");
   const content=buildBlocks(body);$("paper").replaceChildren();
   if(pageInfo.header){const header=document.createElement("header");header.className="odt-running-header";header.append(buildBlocks(pageInfo.header));$("paper").append(header)}
   $("paper").append(content);
   if(footnotes.length){const section=document.createElement("section");section.className="odt-footnotes";const heading=document.createElement("h2");heading.textContent="Notes";section.append(heading,...footnotes);$("paper").append(section)}
   if(pageInfo.footer){const footer=document.createElement("footer");footer.className="odt-running-footer";footer.append(buildBlocks(pageInfo.footer));$("paper").append(footer)}
   const zipNames=Object.keys(zip.files);
   const mediaTypes=new Map();
   const manifestFile=zip.file("META-INF/manifest.xml");
   if(manifestFile){
    const manifestXml=new DOMParser().parseFromString(await manifestFile.async("text"),"application/xml");
    if(!manifestXml.querySelector("parsererror")){
     for(const entry of Array.from(manifestXml.getElementsByTagName("*")).filter(el=>el.localName==="file-entry")){
      const path=entry.getAttribute("manifest:full-path"),type=entry.getAttribute("manifest:media-type");
      if(path&&type)mediaTypes.set(path.replace(/^\.\//,""),type);
     }
    }
   }
   function findPackageFile(href){
    let decoded=href;try{decoded=decodeURIComponent(href)}catch{}
    decoded=decoded.split("#")[0].split("?")[0].replace(/^\/+/,"");
    const candidates=[decoded,decoded.replace(/^\.\//,"")];
    let normalized=decoded;
    const pieces=[];for(const part of normalized.split("/")){if(!part||part===".")continue;if(part==="..")pieces.pop();else pieces.push(part)}
    normalized=pieces.join("/");
    candidates.push(normalized);
    const base=normalized.split("/").pop();if(base){
     candidates.push("Pictures/"+base,base,"ObjectReplacements/"+base);
     for(const ext of [".svg",".png",".jpg",".jpeg",".gif",".webp",".bmp"])candidates.push("ObjectReplacements/"+base+ext);
    }
    for(const candidate of candidates){const file=zip.file(candidate);if(file&&!file.dir)return file}
    const match=zipNames.find(name=>!zip.files[name].dir&&base&&name.endsWith("/"+base));return match?zip.file(match):null
   }
   for(const img of $("paper").querySelectorAll("img[data-odt-path]")){const file=findPackageFile(img.dataset.odtPath);if(file){const blob=await file.async("blob");const name=file.name||img.dataset.odtPath;const mime=mediaTypes.get(name)||mediaTypes.get(name.replace(/^\.\//,""))||({svg:"image/svg+xml",svgz:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",bmp:"image/bmp"}[name.split(".").pop().toLowerCase()])||"application/octet-stream";const typed=blob.type?blob:new Blob([blob],{type:mime});const url=URL.createObjectURL(typed);imageUrls.push(url);img.src=url;img.addEventListener("error",()=>{img.alt="Could not display embedded image: "+(img.alt||"image")},{once:true})}else{img.replaceWith(document.createTextNode("["+img.alt+" unavailable in this ODT package]"))}}
   for(const link of $("paper").querySelectorAll("a[data-odt-object-path]")){const file=findPackageFile(link.dataset.odtObjectPath);if(file){const blob=await file.async("blob");const url=URL.createObjectURL(blob);imageUrls.push(url);link.href=url;link.target="_blank";link.rel="noopener noreferrer"}else link.replaceWith(document.createTextNode("[Embedded object unavailable]"))}
   const headings=Array.from($("paper").querySelectorAll("h1,h2,h3,h4,h5,h6"));$("outline").replaceChildren();
   if(!headings.length)$("outline").textContent="No headings in this book.";
   headings.forEach((h,i)=>{if(!h.textContent.trim())return;const item=document.createElement("div");item.className="outline";item.style.paddingLeft=(Number(h.tagName[1])-1)*10+12+"px";item.textContent=h.textContent;item.addEventListener("click",()=>h.scrollIntoView({behavior:"smooth",block:"start"}));$("outline").append(item)});
   const saved=JSON.parse(localStorage.getItem(progressKey)||"{}");const key=books[index].sha;const scroll=saved[key]||0;if(scroll>0)setTimeout(()=>$("paper").scrollTop=scroll,0);
   $("paper").style.setProperty("--reader-size",scale+"px");
   const details=[documentMeta.title||books[index].title,documentMeta.creator?"By "+documentMeta.creator:"",documentMeta.subject||"",documentMeta.date||""].filter(Boolean);$("bookMeta").textContent=details.join(" · ")+" · "+(books[index].size/1024).toFixed(1)+" KB · Source: Kwiddle GitHub";
   $("fontInfo").textContent=activeFonts.size?"Document fonts: "+Array.from(activeFonts).join(", "):"No explicit font families declared; reader uses its default Literata typeface.";
   $("paper").dataset.bookSha=key;
   $("paper").onscroll=()=>{const data=JSON.parse(localStorage.getItem(progressKey)||"{}");data[key]=$("paper").scrollTop;localStorage.setItem(progressKey,JSON.stringify(data))};
  }catch(e){$("paper").innerHTML='<div class="empty"><h2>Could not open this book</h2><p></p></div>';$("paper").querySelector("p").textContent=e.message+" — try refreshing the library."}
 }
 function changeSize(delta){scale=Math.max(12,Math.min(28,scale+delta));$("paper").style.setProperty("--reader-size",scale+"px")}
 function find(){const q=$("find").value.trim();if(!q)return;const walker=document.createTreeWalker($("paper"),NodeFilter.SHOW_TEXT);const ranges=[];let node;while(node=walker.nextNode()){let at=0,txt=node.nodeValue.toLowerCase();while((at=txt.indexOf(q.toLowerCase(),at))!==-1){const r=document.createRange();r.setStart(node,at);r.setEnd(node,at+q.length);ranges.push(r);at+=q.length}}searchMatches=ranges;matchIndex=0;if(ranges.length){const r=ranges[0];const mark=document.createElement("mark");r.surroundContents(mark);mark.scrollIntoView({behavior:"smooth",block:"center"})}else alert("No matches found in this book.")}
 $("refresh").addEventListener("click",()=>loadBooks(true));$("bookSearch").addEventListener("input",renderList);$("prev").addEventListener("click",()=>openBook(current-1));$("next").addEventListener("click",()=>openBook(current+1));$("smaller").addEventListener("click",()=>changeSize(-1));$("larger").addEventListener("click",()=>changeSize(1));$("findNext").addEventListener("click",find);$("find").addEventListener("keydown",e=>{if(e.key==="Enter")find()});$("fonts").addEventListener("click",()=>$("fontInfo").scrollIntoView({behavior:"smooth"}));$("print").addEventListener("click",()=>window.print());$("theme").addEventListener("change",e=>{document.documentElement.dataset.theme=e.target.value;document.cookie="theme="+encodeURIComponent(e.target.value)+"; path=/; max-age=31536000; SameSite=Lax"});$("readingTheme").addEventListener("change",e=>{if(e.target.value==="sepia")document.documentElement.dataset.reading="sepia";else delete document.documentElement.dataset.reading});$("toggleBooks").addEventListener("click",()=>$("sidebar").classList.toggle("collapsed"));
 document.addEventListener("keydown",e=>{if(e.target.matches("input,textarea,select"))return;if(e.key==="ArrowLeft"&&current>0)openBook(current-1);if(e.key==="ArrowRight"&&current<books.length-1)openBook(current+1);if(e.key==="+"||e.key==="=")changeSize(1);if(e.key==="-")changeSize(-1);if(e.key==="/" ){e.preventDefault();$("find").focus()}});
 loadBooks(false);setInterval(()=>loadBooks(true),5*60*1000);
})();
