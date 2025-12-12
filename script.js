// Constants and configurations
const DEFAULT_RATIO = 4 / 3;
const SIZE_SLIDER_MIN = 50;
const SIZE_SLIDER_MAX = 1000;
const DEFAULT_SIZE_VALUE = Math.round((SIZE_SLIDER_MIN + SIZE_SLIDER_MAX) / 2);
const MAX_DISPLAY_WIDTH = 900;
const MIN_TARGET_WIDTH = 16;
const MIN_PIXEL_SIZE = 1;
const MAX_PIXEL_SIZE = 64;

const ORDERED_DITHERING_MAPS = {
  "2X2 map": [[0, 2], [3, 1]],
  "4X4 map": [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]],
  "8X8 map": [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]] };


const DIFFUSION_KERNELS = {
  "Floyd Steinberg": [[0, 1, 7, 16], [1, -1, 3, 16], [1, 0, 5, 16], [1, 1, 1, 16]],
  "Jarvis, Judice, Nink": [[0, 1, 7, 48], [0, 2, 5, 48], [1, -2, 3, 48], [1, -1, 5, 48], [1, 0, 7, 48], [1, 1, 5, 48], [1, 2, 3, 48], [2, -2, 1, 48], [2, -1, 3, 48], [2, 0, 5, 48], [2, 1, 3, 48], [2, 2, 1, 48]],
  "Stucki": [[0, 1, 8, 42], [0, 2, 4, 42], [1, -2, 2, 42], [1, -1, 4, 42], [1, 0, 8, 42], [1, 1, 4, 42], [1, 2, 2, 42], [2, -2, 1, 42], [2, -1, 2, 42], [2, 0, 4, 42], [2, 1, 2, 42], [2, 2, 1, 42]],
  "Atkinson": [[0, 1, 1, 8], [0, 2, 1, 8], [1, -1, 1, 8], [1, 0, 1, 8], [1, 1, 1, 8], [2, 0, 1, 8]],
  "Burkes": [[0, 1, 8, 32], [0, 2, 4, 32], [1, -2, 2, 32], [1, -1, 4, 32], [1, 0, 8, 32], [1, 1, 4, 32], [1, 2, 2, 32]],
  "One-dimensional horizontal": [[0, 1, 1, 1]],
  "One-dimensional vertical": [[1, 0, 1, 1]],
  "Two-dimensional": [[0, 1, 1, 2], [1, 0, 1, 2]],
  "DTH glitch 1": [[0, 1, 1, 1], [-1, 2, 2, 1]],
  "DTH glitch 2": [[0, 3, 1, 1]],
  "DTH glitch 3": [[4, 0, 1, 1]] };


// Utility functions
const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));
const toGrayscale = pixel => pixel[0] * 0.3 + pixel[1] * 0.59 + pixel[2] * 0.11;
const quantization = (pixel, bitDepth) => {
  const depth = Math.max(bitDepth, 1);
  const step = 255 / depth;
  const quant = value => clamp(Math.round(value / step) * step);
  return [quant(pixel[0]), quant(pixel[1]), quant(pixel[2]), pixel[3]];
};

const createMatrix = (data, width, height) => {
  const matrix = [];
  let index = 0;
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push([data[index], data[index + 1], data[index + 2], data[index + 3]]);
      index += 4;
    }
    matrix.push(row);
  }
  return matrix;
};

const drawMatrix = (ctx, matrix, pixelSize = 1) => {
  const height = matrix.length;
  const width = height ? matrix[0].length : 0;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  let index = 0;
  for (let y = 0; y < height; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      const pixel = row[x];
      data[index] = pixel[0];
      data[index + 1] = pixel[1];
      data[index + 2] = pixel[2];
      data[index + 3] = pixel[3];
      index += 4;
    }
  }
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, width * pixelSize, height * pixelSize);
  }
};

const mapSliderToPixelSize = value => {
  const clamped = Math.min(Math.max(value, SIZE_SLIDER_MIN), SIZE_SLIDER_MAX);
  const normalized = (clamped - SIZE_SLIDER_MIN) / (SIZE_SLIDER_MAX - SIZE_SLIDER_MIN);
  const eased = 1 - Math.pow(normalized, 0.45);
  const size = MIN_PIXEL_SIZE + eased * (MAX_PIXEL_SIZE - MIN_PIXEL_SIZE);
  return Math.max(MIN_PIXEL_SIZE, Math.min(MAX_PIXEL_SIZE, Math.round(size)));
};

const computeRenderInfo = (sizeValue, ratio, naturalWidth, naturalHeight) => {
  const pixelSize = mapSliderToPixelSize(sizeValue);
  const maxSampleWidth = Math.max(MIN_TARGET_WIDTH, Math.floor(MAX_DISPLAY_WIDTH / pixelSize));
  let sampleWidth = maxSampleWidth;
  if (naturalWidth) sampleWidth = Math.min(sampleWidth, Math.max(MIN_TARGET_WIDTH, Math.round(naturalWidth)));
  let sampleHeight = Math.max(1, Math.round(sampleWidth / ratio));
  if (naturalHeight && sampleHeight > naturalHeight) {
    sampleHeight = Math.max(1, Math.round(naturalHeight));
    sampleWidth = Math.max(MIN_TARGET_WIDTH, Math.round(sampleHeight * ratio));
  }
  return {
    sampleWidth, sampleHeight, pixelSize,
    displayWidth: sampleWidth * pixelSize,
    displayHeight: sampleHeight * pixelSize };

};

const matrixForEach = (matrix, callback) => {
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      callback(row[x], x, y);
    }
  }
};

const applyOrderedDithering = (matrix, type, bitDepth) => {
  const map = ORDERED_DITHERING_MAPS[type];
  if (!map) return;
  const size = map.length;
  const denominator = size ** 2;
  const step = 255 / Math.max(bitDepth, 1);
  matrixForEach(matrix, (pixel, x, y) => {
    const factor = map[y % size][x % size];
    const bayer = step * (factor / denominator - 0.5);
    for (let i = 0; i < 3; i++) pixel[i] = clamp(pixel[i] + bayer);
    const quantized = quantization(pixel, bitDepth);
    for (let i = 0; i < 3; i++) pixel[i] = quantized[i];
  });
};

const applyDiffusionDithering = (matrix, type, bitDepth) => {
  const kernel = DIFFUSION_KERNELS[type];
  if (!kernel) return;
  matrixForEach(matrix, (pixel, x, y) => {
    const original = [...pixel];
    const quantized = quantization(pixel, bitDepth);
    for (let i = 0; i < 3; i++) pixel[i] = quantized[i];
    const quantError = toGrayscale(original) - toGrayscale(quantized);
    kernel.forEach(([offsetY, offsetX, weight, divisor]) => {
      const targetRow = matrix[y + offsetY];
      if (!targetRow) return;
      const targetPixel = targetRow[x + offsetX];
      if (!targetPixel) return;
      const error = quantError * weight / divisor;
      for (let i = 0; i < 3; i++) targetPixel[i] = clamp(targetPixel[i] + error);
    });
  });
};

const applyDithering = (matrix, settings) => {
  if (!settings.colored) {
    matrixForEach(matrix, pixel => {
      const lightness = toGrayscale(pixel);
      pixel[0] = lightness;
      pixel[1] = lightness;
      pixel[2] = lightness;
    });
  }
  if (ORDERED_DITHERING_MAPS[settings.type]) applyOrderedDithering(matrix, settings.type, settings.bitDepth);
  if (DIFFUSION_KERNELS[settings.type]) applyDiffusionDithering(matrix, settings.type, settings.bitDepth);
};

// State
const state = {
  ditherType: 'Floyd Steinberg',
  isColored: false,
  zoomSlider: 50,
  brightnessSlider: 100,
  contrastSlider: 100,
  bitDepthSlider: 1,
  sizeSlider: DEFAULT_SIZE_VALUE,
  image: null,
  lastRender: null,
  fitScale: 1,
  rafHandle: null,
  throttleTimer: null };


// DOM elements
const canvasRef = document.getElementById('canvas');
const canvasInnerRef = document.getElementById('canvasInner');
const fileInputRef = document.getElementById('fileInput');
const zoomSliderRef = document.getElementById('zoomSlider');
const sizeSliderRef = document.getElementById('sizeSlider');
const ditherTypeSelect = document.getElementById('ditherType');
const colorButton = document.getElementById('colorButton');
const brightnessSliderRef = document.getElementById('brightnessSlider');
const contrastSliderRef = document.getElementById('contrastSlider');
const bitDepthSliderRef = document.getElementById('bitDepthSlider');
const exportPngBtn = document.getElementById('exportPng');
const exportSvgBtn = document.getElementById('exportSvg');

// Update functions
const updateFitScale = (displayWidth, displayHeight) => {
  const wrapper = canvasInnerRef.parentElement;
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scale = Math.min(rect.width / displayWidth, rect.height / displayHeight);
  if (Number.isFinite(scale) && scale > 0) {
    state.fitScale = scale;
    const zoomValue = (61 - state.zoomSlider) / 10;
    canvasInnerRef.style.transform = `scale(${scale * zoomValue})`;
  }
};

const processImage = settings => {var _state$image, _state$image2;
  const ctx = canvasRef.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const naturalWidth = ((_state$image = state.image) === null || _state$image === void 0 ? void 0 : _state$image.naturalWidth) || 0;
  const naturalHeight = ((_state$image2 = state.image) === null || _state$image2 === void 0 ? void 0 : _state$image2.naturalHeight) || 0;
  const ratio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : DEFAULT_RATIO;
  const info = computeRenderInfo(settings.sizeValue, ratio, naturalWidth, naturalHeight);

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = info.sampleWidth;
  baseCanvas.height = info.sampleHeight;
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
  if (!baseCtx) return;

  baseCtx.imageSmoothingEnabled = false;
  baseCtx.fillStyle = '#ffffff';
  baseCtx.fillRect(0, 0, info.sampleWidth, info.sampleHeight);

  if (state.image && state.image.complete && naturalWidth > 0 && naturalHeight > 0) {
    try {
      baseCtx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;
      baseCtx.drawImage(state.image, 0, 0, info.sampleWidth, info.sampleHeight);
      baseCtx.filter = 'none';
    } catch (e) {
      console.error('Error drawing image:', e);
    }
  }

  const imageData = baseCtx.getImageData(0, 0, info.sampleWidth, info.sampleHeight);
  const matrix = createMatrix(imageData.data, info.sampleWidth, info.sampleHeight);

  applyDithering(matrix, { bitDepth: settings.bitDepth, type: settings.ditherType, colored: settings.colored });

  canvasRef.width = info.sampleWidth;
  canvasRef.height = info.sampleHeight;
  ctx.imageSmoothingEnabled = false;
  drawMatrix(ctx, matrix, 1);

  canvasRef.style.width = `${info.displayWidth}px`;
  canvasRef.style.height = `${info.displayHeight}px`;

  state.lastRender = { matrix, info };
  updateFitScale(info.displayWidth, info.displayHeight);
};

const scheduleProcessing = settings => {
  if (state.rafHandle === null) {
    state.rafHandle = requestAnimationFrame(() => {
      state.rafHandle = null;
      processImage(settings);
    });
  }
};

// Event handlers
const handleZoomChange = e => {
  const value = Number(e.target.value);
  state.zoomSlider = value;
  const zoomValue = (61 - value) / 10;
  document.getElementById('zoomDisplay').textContent = zoomValue.toFixed(1);
  canvasInnerRef.style.transform = `scale(${state.fitScale * zoomValue})`;
};

const handleSizeChange = e => {
  const value = Number(e.target.value);
  state.sizeSlider = value;
  const pixelSize = mapSliderToPixelSize(value);
  document.getElementById('pixelSizeVal').textContent = `${pixelSize} px`;
  if (!state.throttleTimer) {
    scheduleProcessing({
      sizeValue: value,
      brightness: state.brightnessSlider,
      contrast: state.contrastSlider,
      bitDepth: state.bitDepthSlider,
      ditherType: state.ditherType,
      colored: state.isColored });

    state.throttleTimer = setTimeout(() => {state.throttleTimer = null;}, 16);
  }
};

const handleBrightnessChange = e => {
  const value = Number(e.target.value);
  state.brightnessSlider = value;
  document.getElementById('brightnessVal').textContent = value;
  scheduleProcessing({
    sizeValue: state.sizeSlider,
    brightness: value,
    contrast: state.contrastSlider,
    bitDepth: state.bitDepthSlider,
    ditherType: state.ditherType,
    colored: state.isColored });

};

const handleContrastChange = e => {
  const value = Number(e.target.value);
  state.contrastSlider = value;
  document.getElementById('contrastVal').textContent = value;
  scheduleProcessing({
    sizeValue: state.sizeSlider,
    brightness: state.brightnessSlider,
    contrast: value,
    bitDepth: state.bitDepthSlider,
    ditherType: state.ditherType,
    colored: state.isColored });

};

const handleBitDepthChange = e => {
  const value = Number(e.target.value);
  state.bitDepthSlider = value;
  document.getElementById('bitDepthVal').textContent = value;
  scheduleProcessing({
    sizeValue: state.sizeSlider,
    brightness: state.brightnessSlider,
    contrast: state.contrastSlider,
    bitDepth: value,
    ditherType: state.ditherType,
    colored: state.isColored });

};

const handleDitherTypeChange = e => {
  state.ditherType = e.target.value;
  scheduleProcessing({
    sizeValue: state.sizeSlider,
    brightness: state.brightnessSlider,
    contrast: state.contrastSlider,
    bitDepth: state.bitDepthSlider,
    ditherType: state.ditherType,
    colored: state.isColored });

};

const handleColorButtonClick = () => {
  state.isColored = !state.isColored;
  colorButton.textContent = state.isColored ? 'colored' : 'monochrome';
  colorButton.classList.toggle('active');
  scheduleProcessing({
    sizeValue: state.sizeSlider,
    brightness: state.brightnessSlider,
    contrast: state.contrastSlider,
    bitDepth: state.bitDepthSlider,
    ditherType: state.ditherType,
    colored: state.isColored });

};

const handleFileChange = event => {var _event$target$files;
  const file = (_event$target$files = event.target.files) === null || _event$target$files === void 0 ? void 0 : _event$target$files[0];
  if (!file) {
    state.image = null;
    processImage({
      sizeValue: state.sizeSlider,
      brightness: state.brightnessSlider,
      contrast: state.contrastSlider,
      bitDepth: state.bitDepthSlider,
      ditherType: state.ditherType,
      colored: state.isColored });

    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.image = img;
    processImage({
      sizeValue: state.sizeSlider,
      brightness: state.brightnessSlider,
      contrast: state.contrastSlider,
      bitDepth: state.bitDepthSlider,
      ditherType: state.ditherType,
      colored: state.isColored });

  };
  img.onerror = () => {
    console.error('Failed to load image');
    state.image = null;
  };
  img.src = objectUrl;
  fileInputRef.value = '';
};

const handleExportPng = () => {
  if (!state.lastRender) return;
  const exportMultiplier = Math.max(1, Math.round((61 - state.zoomSlider) / 10)) * 4;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = state.lastRender.info.sampleWidth * state.lastRender.info.pixelSize * exportMultiplier;
  exportCanvas.height = state.lastRender.info.sampleHeight * state.lastRender.info.pixelSize * exportMultiplier;
  const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });
  if (!exportCtx) return;
  exportCtx.imageSmoothingEnabled = false;
  drawMatrix(exportCtx, state.lastRender.matrix, state.lastRender.info.pixelSize * exportMultiplier);
  const link = document.createElement('a');
  link.href = exportCanvas.toDataURL('image/png');
  link.download = `dithering-${Date.now()}.png`;
  link.click();
};

const handleExportSvg = () => {
  if (!state.lastRender) return;
  const { matrix, info } = state.lastRender;
  let svgContent = `<svg width="${info.displayWidth}" height="${info.displayHeight}" xmlns="http://www.w3.org/2000/svg">`;
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      const pixel = matrix[y][x];
      const color = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
      svgContent += `<rect x="${x * info.pixelSize}" y="${y * info.pixelSize}" width="${info.pixelSize}" height="${info.pixelSize}" fill="${color}"/>`;
    }
  }
  svgContent += '</svg>';
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `dithering-${Date.now()}.svg`;
  link.click();
};

// Event listeners
zoomSliderRef.addEventListener('input', handleZoomChange);
sizeSliderRef.addEventListener('input', handleSizeChange);
brightnessSliderRef.addEventListener('input', handleBrightnessChange);
contrastSliderRef.addEventListener('input', handleContrastChange);
bitDepthSliderRef.addEventListener('input', handleBitDepthChange);
ditherTypeSelect.addEventListener('change', handleDitherTypeChange);
colorButton.addEventListener('click', handleColorButtonClick);
fileInputRef.addEventListener('change', handleFileChange);
exportPngBtn.addEventListener('click', handleExportPng);
exportSvgBtn.addEventListener('click', handleExportSvg);

// Initialize
window.addEventListener('resize', () => {
  if (state.lastRender) {
    updateFitScale(state.lastRender.info.displayWidth, state.lastRender.info.displayHeight);
  }
});

processImage({
  sizeValue: DEFAULT_SIZE_VALUE,
  brightness: 100,
  contrast: 100,
  bitDepth: 1,
  ditherType: 'Floyd Steinberg',
  colored: false });