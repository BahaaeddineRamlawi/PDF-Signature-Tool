const pdfUpload = document.getElementById("pdfUpload");
const signatureUpload = document.getElementById("signatureUpload");
const canvas = document.getElementById("pdfCanvas");
const ctx = canvas.getContext("2d");
const downloadBtn = document.getElementById("downloadBtn");

const nextBtn = document.createElement("button");
const prevBtn = document.createElement("button");
const addSignatureBtn = document.createElement("button");

let pdfBytes = null;
let pdfDoc = null;
let currentPageNumber = 1;
let totalPageCount = 0;

const canvasContainer = canvas.parentNode;

const signatures = {};
let signatureSrc = null;

let activeSigId = null;
let offsetX, offsetY;
let isDragging = false;
let sigIdCounter = 0;

prevBtn.textContent = "← Previous";
nextBtn.textContent = "Next →";
addSignatureBtn.textContent = "➕ Add Signature";
prevBtn.disabled = true;
nextBtn.disabled = true;
addSignatureBtn.disabled = true;
prevBtn.id = "prevBtn";
nextBtn.id = "nextBtn";
addSignatureBtn.id = "addSignatureBtn";

const buttonsContainer = document.createElement("div");
buttonsContainer.className = "buttons-container";
buttonsContainer.appendChild(prevBtn);
buttonsContainer.appendChild(addSignatureBtn);
buttonsContainer.appendChild(nextBtn);
canvasContainer.appendChild(buttonsContainer);

// === RENDER PAGE ===
async function renderPage(pageNum) {
  if (!pdfDoc) return;

  const page = await pdfDoc.getPage(pageNum);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  prevBtn.disabled = pageNum <= 1;
  nextBtn.disabled = pageNum >= totalPageCount;

  document.querySelectorAll(".signature-wrapper").forEach((el) => el.remove());

  if (signatures[pageNum]) {
    for (const sig of signatures[pageNum]) {
      createSignatureElement(sig);
    }
  }

  currentPageNumber = pageNum;
}

// === CREATE SIGNATURE ELEMENT ===
function createSignatureElement(sig) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("signature-wrapper");
  wrapper.dataset.id = sig.id;
  wrapper.style.position = "absolute";
  wrapper.style.cursor = "move";
  wrapper.style.borderRadius = "6px";
  wrapper.style.userSelect = "none";
  wrapper.style.touchAction = "none";

  const canvasRect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;

  wrapper.style.left = sig.left / scaleX + "px";
  wrapper.style.top = sig.top / scaleY + "px";
  wrapper.style.width = sig.width / scaleX + "px";

  if (!sig.interacted) {
    wrapper.style.backgroundColor = "rgba(255, 0, 0, 0.2)";
  }

  const img = document.createElement("img");
  img.src = signatureSrc;
  img.style.width = "100%";
  img.style.display = "block";
  img.draggable = false;
  img.style.userSelect = "none";

  const delBtn = document.createElement("button");
  delBtn.textContent = "×";
  delBtn.title = "Remove";
  delBtn.style.position = "absolute";
  delBtn.style.top = "2px";
  delBtn.style.right = "4px";
  delBtn.style.background = "rgba(0,0,0,0.5)";
  delBtn.style.color = "white";
  delBtn.style.border = "none";
  delBtn.style.borderRadius = "50%";
  delBtn.style.width = "20px";
  delBtn.style.height = "20px";
  delBtn.style.fontWeight = "bold";
  delBtn.style.lineHeight = "18px";
  delBtn.style.cursor = "pointer";
  delBtn.style.zIndex = "10";

  wrapper.appendChild(img);
  wrapper.appendChild(delBtn);
  canvasContainer.appendChild(wrapper);

  // === DRAG START ===
  wrapper.addEventListener("mousedown", (e) => {
    if (e.target === delBtn) return;
    activeSigId = sig.id;
    isDragging = true;
    offsetX = e.offsetX;
    offsetY = e.offsetY;

    sig.interacted = true;
    wrapper.style.backgroundColor = "transparent";
  });

  // === DRAG MOVE ===
  window.addEventListener("mousemove", (e) => {
    if (!isDragging || activeSigId !== sig.id) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let newLeft = (e.clientX - rect.left) * scaleX - offsetX * scaleX;
    let newTop = (e.clientY - rect.top) * scaleY - offsetY * scaleY;

    newLeft = Math.min(
      Math.max(0, newLeft),
      canvas.width - wrapper.offsetWidth * scaleX
    );
    newTop = Math.min(
      Math.max(0, newTop),
      canvas.height - wrapper.offsetHeight * scaleY
    );

    wrapper.style.left = newLeft / scaleX + "px";
    wrapper.style.top = newTop / scaleY + "px";

    const sigs = signatures[currentPageNumber];
    const s = sigs.find((s) => s.id === activeSigId);
    if (s) {
      s.left = newLeft;
      s.top = newTop;
    }
  });

  // === DRAG END ===
  window.addEventListener("mouseup", () => {
    isDragging = false;
    activeSigId = null;
  });

  // === RESIZE ===
  wrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;

    let widthCss = wrapper.offsetWidth;
    let newWidthCss = e.deltaY < 0 ? widthCss * 1.05 : widthCss * 0.95;
    newWidthCss = Math.min(Math.max(30, newWidthCss), 300);
    wrapper.style.width = newWidthCss + "px";

    const sigs = signatures[currentPageNumber];
    const s = sigs.find((s) => s.id === wrapper.dataset.id);
    if (s) {
      s.width = newWidthCss * scaleX;
      s.interacted = true;
    }
  });

  // === DELETE SIGNATURE ===
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    wrapper.remove();
    const sigs = signatures[currentPageNumber];
    const index = sigs.findIndex((s) => s.id === sig.id);
    if (index !== -1) sigs.splice(index, 1);
  });
}

// === UPLOAD PDF ===
pdfUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || file.type !== "application/pdf") return;

  const reader = new FileReader();
  reader.onload = async function () {
    pdfBytes = new Uint8Array(reader.result);
    pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    totalPageCount = pdfDoc.numPages;
    currentPageNumber = 1;
    await renderPage(currentPageNumber);
    downloadBtn.disabled = false;
    prevBtn.disabled = true;
    nextBtn.disabled = totalPageCount <= 1;
  };
  reader.readAsArrayBuffer(file);
});

// === UPLOAD SIGNATURE ===
signatureUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith("image")) return;

  const reader = new FileReader();
  reader.onload = () => {
    signatureSrc = reader.result;
    addSignatureBtn.disabled = false;
  };
  reader.readAsDataURL(file);
});

// === ADD SIGNATURE ===
addSignatureBtn.addEventListener("click", () => {
  if (!signatureSrc) return;

  const defaultWidth = 100;
  const left = (canvas.width - defaultWidth) / 2;
  const top = (canvas.height - defaultWidth) / 2;

  const newSig = {
    id: `sig_${++sigIdCounter}`,
    left,
    top,
    width: defaultWidth,
    interacted: false,
  };

  if (!signatures[currentPageNumber]) signatures[currentPageNumber] = [];
  signatures[currentPageNumber].push(newSig);

  createSignatureElement(newSig);
});

// === NAVIGATION ===
nextBtn.addEventListener("click", async () => {
  if (currentPageNumber < totalPageCount) {
    currentPageNumber++;
    await renderPage(currentPageNumber);
  }
});
prevBtn.addEventListener("click", async () => {
  if (currentPageNumber > 1) {
    currentPageNumber--;
    await renderPage(currentPageNumber);
  }
});

// === DOWNLOAD SIGNED PDF ===
downloadBtn.addEventListener("click", async () => {
  if (!pdfBytes || !signatureSrc) return;

  const pdfLibDoc = await PDFLib.PDFDocument.load(pdfBytes);
  const pngImageBytes = await fetch(signatureSrc).then((res) =>
    res.arrayBuffer()
  );
  const pngImage = await pdfLibDoc.embedPng(pngImageBytes);

  for (let i = 0; i < pdfLibDoc.getPageCount(); i++) {
    const pageNum = i + 1;
    const page = pdfLibDoc.getPage(i);
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    if (!signatures[pageNum]) continue;

    for (const sig of signatures[pageNum]) {
      const xScale = pdfWidth / canvas.width;
      const yScale = pdfHeight / canvas.height;

      const x = sig.left * xScale;
      const yFromTop = sig.top * yScale;

      const imgWidth = sig.width * xScale;
      const imgHeight = (sig.width / pngImage.width) * pngImage.height * xScale;

      const y = pdfHeight - yFromTop - imgHeight;

      page.drawImage(pngImage, {
        x,
        y,
        width: imgWidth,
        height: imgHeight,
      });
    }
  }

  const pdfBytesSigned = await pdfLibDoc.save();
  const blob = new Blob([pdfBytesSigned], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const originalName = pdfUpload.files[0]?.name || "document.pdf";
  const signedName = originalName.replace(/\.pdf$/i, "_signed.pdf");
  link.download = signedName;
  link.click();
});
