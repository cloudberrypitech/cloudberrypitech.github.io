"use strict";
(() => {
  const $ = id => document.getElementById(id);
  if (!window.pdfjsLib) {
    $("openPdf").disabled = true;
    $("openPdf").title = "The PDF renderer could not be loaded. Check your connection.";
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let pdf = null, pageNumber = 1, zoom = 1, renderTask = null, fileUrl = null;
  let rendering = false;
  const paper = $("paper");
  const meta = $("bookMeta");
  const previous = $("prev"), next = $("next");
  const smaller = $("smaller"), larger = $("larger");

  function active() { return Boolean(pdf); }
  function consume(event) {
    if (!active()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function status() {
    meta.textContent = (pdf ? pdf._kwiddleName : "PDF") +
      " · PDF · Page " + pageNumber + " of " + pdf.numPages +
      " · " + Math.round(zoom * 100) + "%";
    previous.disabled = pageNumber <= 1;
    next.disabled = pageNumber >= pdf.numPages;
  }
  async function renderPage() {
    if (!pdf || rendering) return;
    rendering = true;
    try {
      if (renderTask) { try { renderTask.cancel(); } catch (_) {} }
      const page = await pdf.getPage(pageNumber);
      const available = Math.max(280, paper.clientWidth - 48);
      const base = page.getViewport({scale: 1});
      const scale = Math.min(available / base.width, 2.5) * zoom;
      const viewport = page.getViewport({scale});
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paper.replaceChildren(canvas);
      renderTask = page.render({canvasContext: context, viewport});
      await renderTask.promise;
      status();
    } catch (error) {
      if (error && error.name !== "RenderingCancelledException") {
        paper.textContent = "Could not render this PDF page: " + error.message;
      }
    } finally {
      rendering = false;
    }
  }
  function clearPdf() {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = null; pdf = null; renderTask = null;
    paper.classList.remove("pdf-document");
  }
  async function openFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please choose a PDF file.");
      return;
    }
    try {
      clearPdf();
      const bytes = await file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({data: bytes}).promise;
      pdf._kwiddleName = file.name;
      pageNumber = 1; zoom = 1;
      paper.classList.add("pdf-document");
      $("outline").textContent = "PDF document · use Previous and Next to navigate pages.";
      $("fontInfo").textContent = "PDF is rendered locally in your browser. Your file is not uploaded.";
      await renderPage();
      $("pdfFile").value = "";
    } catch (error) {
      clearPdf();
      alert("Could not open PDF: " + error.message);
    }
  }

  $("openPdf").addEventListener("click", () => $("pdfFile").click());
  $("pdfFile").addEventListener("change", event => openFile(event.target.files[0]));
  previous.addEventListener("click", event => {
    if (!active()) return;
    consume(event);
    if (pageNumber > 1) { pageNumber--; renderPage(); }
  }, true);
  next.addEventListener("click", event => {
    if (!active()) return;
    consume(event);
    if (pageNumber < pdf.numPages) { pageNumber++; renderPage(); }
  }, true);
  smaller.addEventListener("click", event => {
    if (!active()) return;
    consume(event); zoom = Math.max(.5, zoom - .1); renderPage();
  }, true);
  larger.addEventListener("click", event => {
    if (!active()) return;
    consume(event); zoom = Math.min(2.5, zoom + .1); renderPage();
  }, true);
  $("pdfFullscreen").addEventListener("click", async () => {
    if (!active()) {
      $("openPdf").click();
      return;
    }
    try {
      if (!document.fullscreenElement) await $("paper-wrap").requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) { alert("Fullscreen is unavailable: " + error.message); }
  });
  $("bookList").addEventListener("click", () => {
    if (active()) {
      clearPdf();
      paper.classList.remove("pdf-document");
    }
  }, true);
  window.addEventListener("resize", () => { if (active()) renderPage(); });
  document.addEventListener("keydown", event => {
    if (!active() || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === "ArrowLeft" && pageNumber > 1) { pageNumber--; renderPage(); }
    if (event.key === "ArrowRight" && pageNumber < pdf.numPages) { pageNumber++; renderPage(); }
    if (event.key === "Escape" && document.fullscreenElement) document.exitFullscreen();
  });
  window.addEventListener("beforeunload", clearPdf);
})();
