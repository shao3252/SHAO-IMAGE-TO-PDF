/* =====================================
   SHAO PDF - IMAGE TO PDF CONVERTER
   100% OFFLINE VERSION (no CDN needed)
===================================== */

const imageInput = document.getElementById("imageInput");
const imageList = document.getElementById("imageList");
const imageCount = document.getElementById("imageCount");
const convertBtn = document.getElementById("convertBtn");
const message = document.getElementById("message");

const pageSize = document.getElementById("pageSize");
const orientation = document.getElementById("orientation");

let selectedImages = [];
let nextImageId = 1;


// =====================================
// READ IMAGE FILE
// =====================================

function readImageFile(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {

            const image = new Image();

            image.onload = () => {

                resolve({
                    id: nextImageId++,
                    file: file,
                    url: reader.result,
                    name: file.name || "Selected image",
                    size: file.size,
                    width: image.naturalWidth,
                    height: image.naturalHeight
                });

            };

            image.onerror = () => {
                reject(new Error("Unsupported image format"));
            };

            image.src = reader.result;

        };

        reader.onerror = () => {
            reject(new Error("Unable to read selected file"));
        };

        reader.readAsDataURL(file);

    });

}


// =====================================
// SELECT IMAGES - ANDROID FIX
// =====================================

imageInput.addEventListener("change", async function () {

    const files = Array.from(this.files || []);

    if (files.length === 0) return;

    message.textContent = "Loading selected images...";

    let successful = 0;
    let failed = 0;

    for (const file of files) {

        try {

            const image = await readImageFile(file);

            selectedImages.push(image);

            successful++;

        } catch (error) {

            console.error("Image error:", error);

            failed++;

        }

    }

    renderImages();

    if (successful > 0 && failed === 0) {

        message.textContent =
            successful + " image(s) added successfully!";

    } else if (successful > 0) {

        message.textContent =
            successful + " image(s) added. " +
            failed + " could not be opened.";

    } else {

        message.textContent =
            "Unable to load images. Try JPG or PNG.";

    }

    // Allow selecting the same images again
    this.value = "";

});


// =====================================
// DISPLAY SELECTED IMAGES
// =====================================

function renderImages() {

    imageList.innerHTML = "";

    imageCount.textContent =
        selectedImages.length +
        (selectedImages.length === 1 ? " Image" : " Images");

    if (selectedImages.length === 0) {

        imageList.innerHTML = `
            <div class="empty-state">
                Your selected images will appear here.
            </div>
        `;

        return;

    }

    selectedImages.forEach((item) => {

        const div = document.createElement("div");

        div.className = "image-item";

        const img = document.createElement("img");

        img.src = item.url;
        img.alt = item.name;

        const info = document.createElement("div");

        info.className = "image-info";

        const name = document.createElement("strong");

        name.textContent = item.name;

        const size = document.createElement("small");

        size.textContent =
            (item.size / 1024).toFixed(1) + " KB";

        info.appendChild(name);
        info.appendChild(size);

        const actions = document.createElement("div");

        actions.className = "item-actions";

        const crop = document.createElement("button");

        crop.className = "crop-btn";
        crop.textContent = "CROP";

        crop.addEventListener("click", function () {

            openCropModal(item);

        });

        const remove = document.createElement("button");

        remove.className = "remove-btn";
        remove.textContent = "REMOVE";

        remove.addEventListener("click", function () {

            selectedImages = selectedImages.filter(
                image => image.id !== item.id
            );

            renderImages();

            message.textContent = "Image removed.";

        });

        actions.appendChild(crop);
        actions.appendChild(remove);

        div.appendChild(img);
        div.appendChild(info);
        div.appendChild(actions);

        imageList.appendChild(div);

    });

}


// =====================================
// GET PDF PAGE SIZE (mm)
// =====================================

function getPageSize(imageWidth, imageHeight) {

    const size = pageSize.value;
    const selectedOrientation = orientation.value;

    if (size === "fit") {

        const maxSide = 297;

        const ratio = imageWidth / imageHeight;

        let width;
        let height;

        if (ratio > 1) {

            width = maxSide;
            height = maxSide / ratio;

        } else {

            height = maxSide;
            width = maxSide * ratio;

        }

        return { width, height };

    }

    let width = size === "letter" ? 215.9 : 210;

    let height = size === "letter" ? 279.4 : 297;

    if (selectedOrientation === "landscape") {

        [width, height] = [height, width];

    }

    return { width, height };

}


// =====================================
// PREPARE IMAGE (JPEG data URL)
// =====================================

function prepareImage(url) {

    return new Promise((resolve, reject) => {

        const img = new Image();

        img.onload = function () {

            const maxDimension = 2400;

            let width = img.naturalWidth;
            let height = img.naturalHeight;

            const scale = Math.min(
                1,
                maxDimension / Math.max(width, height)
            );

            width = Math.round(width * scale);
            height = Math.round(height * scale);

            const canvas = document.createElement("canvas");

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");

            if (!ctx) {

                reject(new Error("Canvas is unavailable"));
                return;

            }

            ctx.fillStyle = "#ffffff";

            ctx.fillRect(0, 0, width, height);

            ctx.drawImage(img, 0, 0, width, height);

            resolve({

                data: canvas.toDataURL("image/jpeg", 0.88),

                width: width,

                height: height

            });

        };

        img.onerror = function () {

            reject(new Error("Image processing failed"));

        };

        img.src = url;

    });

}


// =====================================
// MINIMAL PDF BUILDER (offline, no libs)
// Embeds JPEG images using DCTDecode.
// pages: [{ jpeg: base64string, imgW, imgH,
//           pageW, pageH (mm) }]
// =====================================

function mmToPt(mm) {
    return mm * 72 / 25.4;
}

function buildPdf(pages) {

    const chunks = [];
    let position = 0;
    const offsets = [];

    function add(str) {
        chunks.push(str);
        position += str.length;
    }

    function beginObject(id) {
        offsets[id] = position;
        add(id + " 0 obj\n");
    }

    add("%PDF-1.4\n");
    add("%\xE2\xE3\xCF\xD3\n"); // binary marker

    const pageCount = pages.length;
    const pageObjId = i => 3 + i * 3;         // page, content, image
    const contentObjId = i => 4 + i * 3;
    const imageObjId = i => 5 + i * 3;
    const totalObjects = 2 + pageCount * 3;

    // ---- Object 1: Catalog ----
    beginObject(1);
    add("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    // ---- Object 2: Pages ----
    beginObject(2);
    let kids = "";
    for (let i = 0; i < pageCount; i++) {
        kids += pageObjId(i) + " 0 R ";
    }
    add("<< /Type /Pages /Kids [" + kids.trim() + "] /Count " + pageCount + " >>\nendobj\n");

    for (let i = 0; i < pageCount; i++) {

        const p = pages[i];

        const pageWPt = mmToPt(p.pageW);
        const pageHPt = mmToPt(p.pageH);

        // margin + fit image inside page
        const margin = mmToPt(5);
        const availW = pageWPt - margin * 2;
        const availH = pageHPt - margin * 2;

        const scale = Math.min(
            availW / p.imgW,
            availH / p.imgH
        );

        const drawW = p.imgW * scale;
        const drawH = p.imgH * scale;
        const x = (pageWPt - drawW) / 2;
        const y = (pageHPt - drawH) / 2;

        // ---- Page object ----
        beginObject(pageObjId(i));
        add(
            "<< /Type /Page " +
            "/Parent 2 0 R " +
            "/MediaBox [0 0 " +
            pageWPt.toFixed(2) + " " + pageHPt.toFixed(2) +
            "] " +
            "/Resources << /XObject << /Im0 " +
            imageObjId(i) + " 0 R >> /ProcSet [/PDF /ImageC] >> " +
            "/Contents " + contentObjId(i) + " 0 R " +
            ">>\nendobj\n"
        );

        // ---- Content stream ----
        const stream =
            "q\n" +
            drawW.toFixed(2) + " 0 0 " + drawH.toFixed(2) + " " +
            x.toFixed(2) + " " + y.toFixed(2) + " cm\n" +
            "/Im0 Do\n" +
            "Q\n";

        beginObject(contentObjId(i));
        add(
            "<< /Length " + stream.length + " >>\n" +
            "stream\n" + stream + "endstream\nendobj\n"
        );

        // ---- Image XObject (raw JPEG, DCTDecode) ----
        const jpegBinary = atob(p.jpeg);
        const imgDict =
            "<< /Type /XObject /Subtype /Image " +
            "/Width " + p.imgW + " " +
            "/Height " + p.imgH + " " +
            "/ColorSpace /DeviceRGB " +
            "/BitsPerComponent 8 " +
            "/Filter /DCTDecode " +
            "/Length " + jpegBinary.length + " " +
            ">>\nstream\n";

        beginObject(imageObjId(i));
        add(imgDict);
        add(jpegBinary);
        add("\nendstream\nendobj\n");

    }

    // ---- xref table ----
    const xrefPos = position;

    add("xref\n");
    add("0 " + (totalObjects + 1) + "\n");
    add("0000000000 65535 f \n");

    for (let id = 1; id <= totalObjects; id++) {
        const off = String(offsets[id]).padStart(10, "0");
        add(off + " 00000 n \n");
    }

    add("trailer\n");
    add("<< /Size " + (totalObjects + 1) + " /Root 1 0 R >>\n");
    add("startxref\n");
    add(xrefPos + "\n");
    add("%%EOF");

    // ---- to Blob ----
    const binary = chunks.join("");
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
    }

    return new Blob([bytes], { type: "application/pdf" });

}


// =====================================
// SAVE BLOB AS FILE
// =====================================

function saveBlob(blob, filename) {

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 4000);

}


// =====================================
// CONVERT TO PDF
// =====================================

convertBtn.addEventListener("click", async function () {

    if (selectedImages.length === 0) {

        message.textContent =
            "Please select at least one image!";

        return;

    }

    convertBtn.disabled = true;

    convertBtn.textContent = "CREATING PDF...";

    try {

        const pages = [];

        for (let i = 0; i < selectedImages.length; i++) {

            message.textContent =
                "Processing image " +
                (i + 1) +
                " of " +
                selectedImages.length;

            const image = await prepareImage(
                selectedImages[i].url
            );

            const page = getPageSize(
                image.width,
                image.height
            );

            pages.push({
                jpeg: image.data.split(",")[1],
                imgW: image.width,
                imgH: image.height,
                pageW: page.width,
                pageH: page.height
            });

        }

        message.textContent = "Saving PDF...";

        const pdfBlob = buildPdf(pages);

        saveBlob(pdfBlob, "SHAO-PDF-Document.pdf");

        message.textContent =
            "PDF created successfully!";

    } catch (error) {

        console.error("PDF Error:", error);

        message.textContent =
            "Conversion failed. Please try another image.";

    } finally {

        convertBtn.disabled = false;

        convertBtn.textContent =
            "CONVERT TO PDF →";

    }

});



// =====================================
// CROP MODAL
// Touch-friendly crop box (drag + resize)
// =====================================

const cropModal = document.getElementById("cropModal");
const cropStage = document.getElementById("cropStage");
const cropImage = document.getElementById("cropImage");
const cropBox = document.getElementById("cropBox");
const cropHandle = document.getElementById("cropHandle");
const cropApplyBtn = document.getElementById("cropApply");
const cropCancelBtn = document.getElementById("cropCancel");

let cropItem = null;
let cropScale = 1;
let cropImgLeft = 0;
let cropImgTop = 0;
let cropDisplayW = 0;
let cropDisplayH = 0;

let cropDragMode = null;      // "move" | "resize"
let cropStartX = 0;
let cropStartY = 0;
let cropOriginBox = null;


function setBox(box) {

    // Clamp inside image bounds
    const minSize = 30;

    box.w = Math.max(minSize, Math.min(box.w, cropDisplayW));
    box.h = Math.max(minSize, Math.min(box.h, cropDisplayH));

    box.x = Math.max(
        cropImgLeft,
        Math.min(box.x, cropImgLeft + cropDisplayW - box.w)
    );

    box.y = Math.max(
        cropImgTop,
        Math.min(box.y, cropImgTop + cropDisplayH - box.h)
    );

    cropBox.style.left = box.x + "px";
    cropBox.style.top = box.y + "px";
    cropBox.style.width = box.w + "px";
    cropBox.style.height = box.h + "px";

    return box;

}


function currentBox() {

    return {
        x: parseFloat(cropBox.style.left) || 0,
        y: parseFloat(cropBox.style.top) || 0,
        w: parseFloat(cropBox.style.width) || 0,
        h: parseFloat(cropBox.style.height) || 0
    };

}


function getPoint(e) {

    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }

    return { x: e.clientX, y: e.clientY };

}


function openCropModal(item) {

    cropItem = item;

    cropModal.hidden = false;

    const stageW = cropStage.clientWidth;
    const stageH = cropStage.clientHeight;

    cropScale = Math.min(
        (stageW - 20) / item.width,
        (stageH - 20) / item.height
    );

    cropDisplayW = item.width * cropScale;
    cropDisplayH = item.height * cropScale;

    cropImgLeft = (stageW - cropDisplayW) / 2;
    cropImgTop = (stageH - cropDisplayH) / 2;

    cropImage.src = item.url;
    cropImage.style.left = cropImgLeft + "px";
    cropImage.style.top = cropImgTop + "px";
    cropImage.style.width = cropDisplayW + "px";
    cropImage.style.height = cropDisplayH + "px";

    // Initial box: 80% of the smaller side, centered
    const side = Math.min(cropDisplayW, cropDisplayH) * 0.8;

    setBox({
        x: cropImgLeft + (cropDisplayW - side) / 2,
        y: cropImgTop + (cropDisplayH - side) / 2,
        w: side,
        h: side
    });

    document.body.style.overflow = "hidden";

}


function closeCropModal() {

    cropModal.hidden = true;

    document.body.style.overflow = "";

    cropItem = null;

}


// ---- Drag to move ----

cropBox.addEventListener("touchstart", function (e) {

    if (e.target === cropHandle) return;

    e.preventDefault();

    cropDragMode = "move";

    const p = getPoint(e);

    cropStartX = p.x;
    cropStartY = p.y;
    cropOriginBox = currentBox();

}, { passive: false });


// ---- Handle to resize ----

cropHandle.addEventListener("touchstart", function (e) {

    e.preventDefault();
    e.stopPropagation();

    cropDragMode = "resize";

    const p = getPoint(e);

    cropStartX = p.x;
    cropStartY = p.y;
    cropOriginBox = currentBox();

}, { passive: false });


// ---- Mouse support (for desktop testing) ----

cropBox.addEventListener("mousedown", function (e) {

    if (e.target === cropHandle) return;

    cropDragMode = "move";

    cropStartX = e.clientX;
    cropStartY = e.clientY;
    cropOriginBox = currentBox();

    e.preventDefault();

});

cropHandle.addEventListener("mousedown", function (e) {

    cropDragMode = "resize";

    cropStartX = e.clientX;
    cropStartY = e.clientY;
    cropOriginBox = currentBox();

    e.preventDefault();
    e.stopPropagation();

});


// ---- Shared move/up handling ----

function onDragMove(e) {

    if (!cropDragMode || !cropOriginBox) return;

    const p = getPoint(e);

    const dx = p.x - cropStartX;
    const dy = p.y - cropStartY;

    if (cropDragMode === "move") {

        setBox({
            x: cropOriginBox.x + dx,
            y: cropOriginBox.y + dy,
            w: cropOriginBox.w,
            h: cropOriginBox.h
        });

    } else {

        // Resize: top-left corner stays fixed
        setBox({
            x: cropOriginBox.x,
            y: cropOriginBox.y,
            w: cropOriginBox.w + dx,
            h: cropOriginBox.h + dy
        });

    }

    if (e.cancelable) e.preventDefault();

}


function onDragEnd() {

    cropDragMode = null;
    cropOriginBox = null;

}


document.addEventListener("touchmove", onDragMove, { passive: false });
document.addEventListener("touchend", onDragEnd);
document.addEventListener("mousemove", onDragMove);
document.addEventListener("mouseup", onDragEnd);


// ---- Apply crop ----

cropApplyBtn.addEventListener("click", function () {

    if (!cropItem) return;

    const box = currentBox();

    const nx = Math.round((box.x - cropImgLeft) / cropScale);
    const ny = Math.round((box.y - cropImgTop) / cropScale);
    const nw = Math.round(box.w / cropScale);
    const nh = Math.round(box.h / cropScale);

    const img = new Image();

    img.onload = function () {

        const canvas = document.createElement("canvas");

        canvas.width = nw;
        canvas.height = nh;

        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#ffffff";

        ctx.fillRect(0, 0, nw, nh);

        ctx.drawImage(img, nx, ny, nw, nh, 0, 0, nw, nh);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

        cropItem.url = dataUrl;
        cropItem.width = nw;
        cropItem.height = nh;
        cropItem.size = Math.round(dataUrl.length * 3 / 4);

        closeCropModal();

        renderImages();

        message.textContent = "Image cropped!";

    };

    img.src = cropItem.url;

});


cropCancelBtn.addEventListener("click", function () {

    closeCropModal();

    message.textContent = "Crop cancelled.";

});


// =====================================
// INITIALIZE APP
// =====================================

renderImages();

console.log("SHAO PDF initialized successfully (offline mode).");
