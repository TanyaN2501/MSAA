"use strict";

const WIDTH = 160;
const HEIGHT = 120;

const elements = {
    shape: document.getElementById("shape"),
    samples: document.getElementById("samples"),
    angle: document.getElementById("angle"),
    zoom: document.getElementById("zoom"),
    figureColor: document.getElementById("figureColor"),
    backgroundColor: document.getElementById("backgroundColor"),

    angleValue: document.getElementById("angleValue"),
    zoomValue: document.getElementById("zoomValue"),
    status: document.getElementById("status"),
    samplesLabel: document.getElementById("samplesLabel"),

    renderTime: document.getElementById("renderTime"),
    sampleCount: document.getElementById("sampleCount"),

    before: document.getElementById("canvasBefore"),
    after: document.getElementById("canvasAfter"),

    zoomBefore: document.getElementById("zoomBefore"),
    zoomAfter: document.getElementById("zoomAfter"),

    sampleCanvas: document.getElementById("sampleCanvas"),
    coverageLabel: document.getElementById("coverageLabel"),
    pixelPosition: document.getElementById("pixelPosition"),
    coveredCount: document.getElementById("coveredCount"),
    totalSamples: document.getElementById("totalSamples"),
    resultColor: document.getElementById("resultColor"),

    download: document.getElementById("downloadBtn"),
    reset: document.getElementById("resetBtn")
};

// Перетворення кольору HEX у RGB.
function hexToRgb(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
}

function rgbToCss(rgb) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// Перевірка точки на належність багатокутнику.
function pointInPolygon(x, y, vertices) {
    let inside = false;

    for (
        let i = 0, j = vertices.length - 1;
        i < vertices.length;
        j = i++
    ) {
        const xi = vertices[i][0];
        const yi = vertices[i][1];
        const xj = vertices[j][0];
        const yj = vertices[j][1];

        if (
            ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        ) {
            inside = !inside;
        }
    }

    return inside;
}

// Побудова зірки.
function createStar() {
    const vertices = [];
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 === 0 ? 49 : 22;

        vertices.push([
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius
        ]);
    }

    return vertices;
}

const starVertices = createStar();

// Перевірка належності точки фігурі.
function isInsideShape(x, y, shape, rotation) {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    const dx = x - cx;
    const dy = y - cy;

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const px = dx * cos + dy * sin + cx;
    const py = -dx * sin + dy * cos + cy;

    switch (shape) {
        case "circle":
            return (
                (px - cx) ** 2 +
                (py - cy) ** 2
            ) <= 43 ** 2;

        case "triangle":
            return pointInPolygon(px, py, [
                [80, 13],
                [24, 105],
                [136, 105]
            ]);

        case "star":
            return pointInPolygon(px, py, starVertices);

        case "line":
            return (
                Math.abs(py - cy - 0.65 * (px - cx)) <= 6 &&
                Math.abs(px - cx) <= 59
            );

        default:
            return false;
    }
}

// Розташування семплів усередині пікселя.
function createSampleOffsets(sampleCount) {
    const columns = Math.ceil(Math.sqrt(sampleCount));
    const rows = Math.ceil(sampleCount / columns);

    const offsets = [];

    for (let i = 0; i < sampleCount; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);

        offsets.push([
            (col + 0.5) / columns,
            (row + 0.5) / rows
        ]);
    }

    return offsets;
}

// Обчислення частки покриття одного пікселя.
function calculateCoverage(
    x,
    y,
    offsets,
    shape,
    rotation
) {
    let covered = 0;

    for (const [offsetX, offsetY] of offsets) {
        if (
            isInsideShape(
                x + offsetX,
                y + offsetY,
                shape,
                rotation
            )
        ) {
            covered++;
        }
    }

    return covered;
}

// Змішування кольорів.
function mixColors(foreground, background, coverage) {
    return [0, 1, 2].map(channel =>
        Math.round(
            foreground[channel] * coverage +
            background[channel] * (1 - coverage)
        )
    );
}

// Основний алгоритм мультисемплінгу.
function renderMSAA(
    canvas,
    sampleCount,
    shape,
    rotation,
    foreground,
    background
) {
    const context = canvas.getContext("2d");
    const imageData = context.createImageData(WIDTH, HEIGHT);
    const pixels = imageData.data;

    const offsets = createSampleOffsets(sampleCount);

    const start = performance.now();

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {

            const covered = calculateCoverage(
                x,
                y,
                offsets,
                shape,
                rotation
            );

            const coverage = covered / sampleCount;

            const color = mixColors(
                foreground,
                background,
                coverage
            );

            const index = (y * WIDTH + x) * 4;

            pixels[index] = color[0];
            pixels[index + 1] = color[1];
            pixels[index + 2] = color[2];
            pixels[index + 3] = 255;
        }
    }

    context.putImageData(imageData, 0, 0);

    return performance.now() - start;
}

// Пошук граничного пікселя.
// Обираємо піксель із частковим покриттям.
function findEdgePixel(shape, rotation, offsets) {
    let best = null;
    let bestScore = Infinity;

    // Шукаємо ближче до центру, щоб фрагмент
    // не виходив за межі полотна.
    for (let y = 20; y < HEIGHT - 20; y++) {
        for (let x = 20; x < WIDTH - 20; x++) {

            const covered = calculateCoverage(
                x,
                y,
                offsets,
                shape,
                rotation
            );

            const coverage = covered / offsets.length;

            if (coverage > 0 && coverage < 1) {
                const distance =
                    Math.hypot(x - WIDTH / 2, y - HEIGHT / 2);

                // Перевага частковому покриттю близько 50%.
                const score =
                    Math.abs(coverage - 0.5) * 35 + distance;

                if (score < bestScore) {
                    bestScore = score;
                    best = { x, y, covered };
                }
            }
        }
    }

    return best;
}

// Збільшення ділянки навколо граничного пікселя.
function renderZoom(
    sourceCanvas,
    targetCanvas,
    zoom,
    edgePixel
) {
    const context = targetCanvas.getContext("2d");

    const targetWidth = targetCanvas.width;
    const targetHeight = targetCanvas.height;

    const sourceWidth = targetWidth / zoom;
    const sourceHeight = targetHeight / zoom;

    const centerX = edgePixel.x + 0.5;
    const centerY = edgePixel.y + 0.5;

    const sourceX = Math.max(
        0,
        Math.min(
            WIDTH - sourceWidth,
            centerX - sourceWidth / 2
        )
    );

    const sourceY = Math.max(
        0,
        Math.min(
            HEIGHT - sourceHeight,
            centerY - sourceHeight / 2
        )
    );

    context.clearRect(
        0,
        0,
        targetWidth,
        targetHeight
    );

    // Важливо: вимикаємо додаткове згладжування.
    context.imageSmoothingEnabled = false;

    context.drawImage(
        sourceCanvas,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        targetWidth,
        targetHeight
    );
}

// Малювання схеми семплів одного пікселя.
function renderSampleVisualization(
    edgePixel,
    offsets,
    shape,
    rotation,
    foreground,
    background
) {
    const canvas = elements.sampleCanvas;
    const ctx = canvas.getContext("2d");

    const size = canvas.width;
    const padding = 25;
    const cellSize = size - padding * 2;

    ctx.clearRect(0, 0, size, size);

    const covered = calculateCoverage(
        edgePixel.x,
        edgePixel.y,
        offsets,
        shape,
        rotation
    );

    const coverage = covered / offsets.length;

    const mixedColor = mixColors(
        foreground,
        background,
        coverage
    );

    // Фон схеми.
    ctx.fillStyle = rgbToCss(background);
    ctx.fillRect(
        padding,
        padding,
        cellSize,
        cellSize
    );

    // Приблизне відображення області фігури.
    // Використовуємо дрібну сітку лише для схеми.
    const steps = 100;
    const stepSize = cellSize / steps;

    ctx.fillStyle = rgbToCss(foreground);

    for (let sy = 0; sy < steps; sy++) {
        for (let sx = 0; sx < steps; sx++) {

            const px = edgePixel.x + (sx + 0.5) / steps;
            const py = edgePixel.y + (sy + 0.5) / steps;

            if (isInsideShape(px, py, shape, rotation)) {
                ctx.fillRect(
                    padding + sx * stepSize,
                    padding + sy * stepSize,
                    stepSize + 0.5,
                    stepSize + 0.5
                );
            }
        }
    }

    // Рамка пікселя.
    ctx.strokeStyle = "#34354c";
    ctx.lineWidth = 2;
    ctx.strokeRect(
        padding,
        padding,
        cellSize,
        cellSize
    );

    // Точки семплінгу.
    for (const [offsetX, offsetY] of offsets) {
        const x = padding + offsetX * cellSize;
        const y = padding + offsetY * cellSize;

        const inside = isInsideShape(
            edgePixel.x + offsetX,
            edgePixel.y + offsetY,
            shape,
            rotation
        );

        // Контрастне обведення точок.
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);

        ctx.fillStyle = inside ? "#ffffff" : "#292942";
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = inside ? "#292942" : "#ffffff";
        ctx.stroke();
    }

    elements.coverageLabel.textContent =
        "Покриття: " + (coverage * 100).toFixed(1) + "%";

    elements.pixelPosition.textContent =
        `(${edgePixel.x}, ${edgePixel.y})`;

    elements.coveredCount.textContent = covered;
    elements.totalSamples.textContent = offsets.length;

    elements.resultColor.style.backgroundColor =
        rgbToCss(mixedColor);
}

// Повне оновлення сцени.
function updateScene() {
    const shape = elements.shape.value;
    const sampleCount = Number(elements.samples.value);
    const angle = Number(elements.angle.value);
    const zoom = Number(elements.zoom.value);

    const rotation = angle * Math.PI / 180;

    const foreground = hexToRgb(
        elements.figureColor.value
    );

    const background = hexToRgb(
        elements.backgroundColor.value
    );

    // Початкове зображення без MSAA.
    renderMSAA(
        elements.before,
        1,
        shape,
        rotation,
        foreground,
        background
    );

    // Зображення з обраною кількістю семплів.
    const elapsed = renderMSAA(
        elements.after,
        sampleCount,
        shape,
        rotation,
        foreground,
        background
    );

    const offsets = createSampleOffsets(sampleCount);

    // Для пошуку граничного пікселя використовуємо
    // щільну сітку, незалежну від обраного режиму.
    // Це дозволяє показувати контур навіть при 1×.
    const searchOffsets = createSampleOffsets(64);

    const edgePixel =
        findEdgePixel(shape, rotation, searchOffsets) ||
        { x: 50, y: 60 };

    renderZoom(
        elements.before,
        elements.zoomBefore,
        zoom,
        edgePixel
    );

    renderZoom(
        elements.after,
        elements.zoomAfter,
        zoom,
        edgePixel
    );

    renderSampleVisualization(
        edgePixel,
        offsets,
        shape,
        rotation,
        foreground,
        background
    );

    elements.angleValue.textContent = angle + "°";
    elements.zoomValue.textContent = zoom + "×";

    elements.status.textContent =
        sampleCount + " семплів/піксель";

    elements.samplesLabel.textContent =
        sampleCount + " семплів";

    elements.renderTime.textContent =
        elapsed.toFixed(2) + " мс";

    elements.sampleCount.textContent =
        (WIDTH * HEIGHT * sampleCount)
            .toLocaleString("uk-UA");
}

// Реакція на зміну налаштувань.
[
    elements.shape,
    elements.samples,
    elements.angle,
    elements.zoom,
    elements.figureColor,
    elements.backgroundColor
].forEach(element => {
    element.addEventListener("input", updateScene);
});

// Завантаження результату.
elements.download.addEventListener("click", () => {
    const link = document.createElement("a");

    link.download = "msaa-result.png";
    link.href = elements.after.toDataURL("image/png");

    link.click();
});

// Скидання параметрів.
elements.reset.addEventListener("click", () => {
    elements.shape.value = "triangle";
    elements.samples.value = "16";
    elements.angle.value = "0";
    elements.zoom.value = "8";
    elements.figureColor.value = "#6857e6";
    elements.backgroundColor.value = "#f3f1ff";

    updateScene();
});

// Перший запуск.
updateScene();
