"use strict";
(() => {
 const OWNER="cloudberrypitech",REPO="kwiddle",BRANCH="main",BOOK_DIR="src/kwiddle/books";
 const API=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${BOOK_DIR}?ref=${BRANCH}`;
 const RAW=`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;
 const $=id=>document.getElementById(id);
 let books=[],current=-1,scale=17,searchMatches=[],matchIndex=0,activeFonts=new Set(),imageUrls=[];
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
   const response=await fetch(API,{cache:"no-store",headers:{"Accept":"application/vnd.github+json"}});
   if(!response.ok)throw Error("GitHub returned "+response.status);
   const data=await response.json();
   books=data.filter(x=>x.type==="file"&&x.name.toLowerCase().endsWith(".odt")&&!x.name.startsWith(".~")).map(x=>({name:x.name,title:safeName(x.name),url:x.download_url||RAW+BOOK_DIR+"/"+encodeURIComponent(x.name),size:x.size,sha:x.sha})).sort((a,b)=>a.title.localeCompare(b.title));
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
 function styleMap(el,styleNames){
  const props={};const family=el.getAttribute("fo:font-family")||el.getAttribute("style:font-name");if(family){props["font-family"]=family.replace(/^['"]|['"]$/g,"");activeFonts.add(family.replace(/^['"]|['"]$/g,""))}
  const size=el.getAttribute("fo:font-size");if(size)props["font-size"]=size;
  const weight=el.getAttribute("fo:font-weight");if(weight)props["font-weight"]=weight;
  const italic=el.getAttribute("fo:font-style");if(italic)props["font-style"]=italic;
  const color=el.getAttribute("fo:color");if(color&&/^#[0-9a-f]{3,8}$/i.test(color))props.color=color;
  const bg=el.getAttribute("fo:background-color");if(bg&&/^#[0-9a-f]{3,8}$/i.test(bg))props["background-color"]=bg;
  return Object.entries(props).map(([k,v])=>k+":"+v).join(";");
 }
 function renderInline(node){
  const frag=document.createDocumentFragment();
  for(const n of node.childNodes){
   if(n.nodeType===3){frag.append(document.createTextNode(n.nodeValue));continue}
   if(n.nodeType!==1)continue;
   const tag=n.localName;let out;
   if(tag==="span"||tag==="a"||tag==="s"||tag==="tab"||tag==="line-break"||tag==="bookmark"||tag==="bookmark-start"||tag==="bookmark-end"){
    out=document.createElement(tag==="a"?"a":tag==="s"?"s":"span");
    const href=n.getAttribute("xlink:href");if(tag==="a"&&href){try{const u=new URL(href,location.href);if(["http:","https:","mailto:"].includes(u.protocol)){out.href=u.href;out.target="_blank";out.rel="noopener noreferrer"}}catch{}}
    const st=styleMap(n);if(st)out.setAttribute("style",st);out.append(renderInline(n));frag.append(out);
   }else if(tag==="tab"){frag.append(document.createTextNode("\t"))}
   else if(tag==="line-break"){frag.append(document.createElement("br"))}
   else{frag.append(renderInline(n))}
  }
  return frag
 }
 function buildBlocks(root){
  const frag=document.createDocumentFragment();
  for(const n of root.children){
   const tag=n.localName;
   if(tag==="p"||tag==="h"){
    const level=Math.max(1,Math.min(6,Number(n.getAttribute("text:outline-level")||1)));
    const p=document.createElement(tag==="h"?"h"+level:"p");
    const st=styleMap(n);if(st)p.setAttribute("style",st);
    const align=n.getAttribute("fo:text-align");if(["center","right","justify","left"].includes(align))p.dataset.align=align;
    p.append(renderInline(n));frag.append(p);
   }else if(tag==="list"){
    const list=document.createElement(n.getAttribute("text:style-name")?.toLowerCase().includes("number")?"ol":"ul");
    for(const item of n.children){if(item.localName!=="list-item")continue;const li=document.createElement("li");li.append(buildBlocks(item));list.append(li)}frag.append(list);
   }else if(tag==="table"){
    const table=document.createElement("table"),body=document.createElement("tbody");
    const rows=Array.from(n.children).flatMap(child=>child.localName==="table-header-rows"||child.localName==="table-rows"?Array.from(child.children).filter(row=>row.localName==="table-row"):(child.localName==="table-row"?[child]:[]));
    for(const row of rows){
     const tr=document.createElement("tr");
     for(const cell of row.children){if(!["table-cell","covered-table-cell"].includes(cell.localName))continue;const td=document.createElement("td");td.append(buildBlocks(cell));const span=cell.getAttribute("table:number-columns-spanned");if(span)td.colSpan=Math.max(1,Number(span));const rowSpan=cell.getAttribute("table:number-rows-spanned");if(rowSpan)td.rowSpan=Math.max(1,Number(rowSpan));tr.append(td)}body.append(tr)
    }table.append(body);frag.append(table);
   }else if(tag==="frame"){
    const img=n.querySelector("image");if(img){const src=img.getAttribute("xlink:href");if(src){const image=document.createElement("img");image.alt=n.getAttribute("draw:name")||"Document image";image.dataset.odtPath=src;frag.append(image)}}
   }else if(tag==="image"){
    const src=n.getAttribute("xlink:href");if(src){const image=document.createElement("img");image.alt="Document image";image.dataset.odtPath=src;frag.append(image)}
   }else if(tag==="section"||tag==="div"){frag.append(buildBlocks(n))}
  }
  return frag
 }
 async function openBook(index){
  if(index<0||index>=books.length)return;current=index;renderList();$("prev").disabled=index===0;$("next").disabled=index===books.length-1;
  $("paper").innerHTML='<div class="empty">Opening '+books[index].title+'…</div>';$("fontInfo").textContent="";activeFonts.clear();imageUrls.forEach(URL.revokeObjectURL);imageUrls=[];
  try{
   const response=await fetch(books[index].url);if(!response.ok)throw Error("Download failed ("+response.status+")");
   const zip=await JSZip.loadAsync(await response.arrayBuffer());const xmlFile=zip.file("content.xml");if(!xmlFile)throw Error("This ODT has no content.xml file");
   const xml= new DOMParser().parseFromString(await xmlFile.async("text"),"application/xml");if(xml.querySelector("parsererror"))throw Error("Invalid ODT XML");
   const body=xml.getElementsByTagName("office:body")[0]?.firstElementChild;if(!body)throw Error("No readable document body found");
   const content=buildBlocks(body);$("paper").replaceChildren(content);
   for(const img of $("paper").querySelectorAll("img[data-odt-path]")){const path=img.dataset.odtPath.replace(/^\.\//,"");const file=zip.file(path);if(file){const blob=await file.async("blob");const url=URL.createObjectURL(blob);imageUrls.push(url);img.src=url}else img.remove()}
   const headings=Array.from($("paper").querySelectorAll("h1,h2,h3,h4,h5,h6"));$("outline").replaceChildren();
   if(!headings.length)$("outline").textContent="No headings in this book.";
   headings.forEach((h,i)=>{if(!h.textContent.trim())return;const item=document.createElement("div");item.className="outline";item.style.paddingLeft=(Number(h.tagName[1])-1)*10+12+"px";item.textContent=h.textContent;item.addEventListener("click",()=>h.scrollIntoView({behavior:"smooth",block:"start"}));$("outline").append(item)});
   const saved=JSON.parse(localStorage.getItem(progressKey)||"{}");const key=books[index].sha;const scroll=saved[key]||0;if(scroll>0)setTimeout(()=>$("paper").scrollTop=scroll,0);
   $("paper").style.setProperty("--reader-size",scale+"px");
   $("bookMeta").textContent=books[index].title+" · "+(books[index].size/1024).toFixed(1)+" KB · Source: Kwiddle GitHub";
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
