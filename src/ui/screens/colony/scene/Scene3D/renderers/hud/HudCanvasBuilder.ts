import * as THREE from 'three';
import { RESOURCES_DB, ResourceId } from '@logic/modules/resources/resources-db';
import { ResourceIcons } from '../ResourceIcons';

export interface HudResourceEntry {
  id: string;
  required: number;
  collected: number;
}

export interface HudCanvasRequest {
  title?: string;
  progress: number;
  showProgress: boolean;
  resources: HudResourceEntry[];
}

export interface HudCanvasResult {
  texture: THREE.CanvasTexture;
  aspect: number;
  contentHeightWorld: number;
  cropX: number;
}

export interface HudStyle {
  textureWidthPx: number;
  safeHorizontalFraction: number;
  contentWorldHeight: number;
  internalScale: number;
  throttleMs: number;
  targetHeightPx: number;
  maxWidthPx: number;
  minScale: number;
  maxScale: number;
  outerPaddingPx: number;
  titleFontPx: number;
  titleLineHeightPx: number;
  titleGapPx: number;
  sectionGapPx: number;
  progressHeightPx: number;
  progressOutlinePaddingPx: number;
  progressMinFillPx: number;
  rowHeightPx: number;
  iconSizePx: number;
  nameFontPx: number;
  nameBaselineOffsetPx: number;
  qtyFontPx: number;
  nameMinWidthPx: number;
  barMinWidthPx: number;
  barMaxWidthPx: number;
  barHeightPx: number;
  barOutlinePaddingPx: number;
  barMinFillPx: number;
  sidePaddingPx: number;
  gapSmallPx: number;
  gapMediumPx: number;
  reqColumnWidthPx: number;
  minRows?: number;
}

const BASE_HUD_STYLE: HudStyle = {
  textureWidthPx: 1024,
  safeHorizontalFraction: 1,
  contentWorldHeight: 1,
  internalScale: 2,
  throttleMs: 180,
  targetHeightPx: 96,
  maxWidthPx: 240,
  minScale: 0.1,
  maxScale: 100,
  outerPaddingPx: 18,
  titleFontPx: 48,
  titleLineHeightPx: 62,
  titleGapPx: 16,
  sectionGapPx: 18,
  progressHeightPx: 10,
  progressOutlinePaddingPx: 3,
  progressMinFillPx: 12,
  rowHeightPx: 56,
  iconSizePx: 46,
  nameFontPx: 44,
  nameBaselineOffsetPx: 2,
  qtyFontPx: 44,
  nameMinWidthPx: 120,
  barMinWidthPx: 96,
  barMaxWidthPx: 260,
  barHeightPx: 8,
  barOutlinePaddingPx: 3,
  barMinFillPx: 12,
  sidePaddingPx: 24,
  gapSmallPx: 12,
  gapMediumPx: 18,
  reqColumnWidthPx: 50,
  minRows: 1,
};

export const BUILDING_HUD_STYLE: HudStyle = {
  ...BASE_HUD_STYLE,
  titleFontPx: 48,
  titleLineHeightPx: 62,
  targetHeightPx: 84,
  maxWidthPx: 240,
};

export const ROAD_HUD_STYLE: HudStyle = {
  ...BASE_HUD_STYLE,
  titleFontPx: 48,
  titleLineHeightPx: 62,
  reqColumnWidthPx: 50,
};

export class HudCanvasBuilder {
  private cachedCanvasTexture: THREE.CanvasTexture | null = null;
  private lastAspect = 1;
  private lastContentHeightWorld = 1;
  private lastCropX = 1;
  private lastCanvasUpdate = 0;

  constructor(private renderer: THREE.WebGLRenderer | undefined, private readonly style: HudStyle) {}

  build(request: HudCanvasRequest, options?: { disableCache?: boolean }): HudCanvasResult {
    const showProgress = request.showProgress !== false;
    const now = Date.now();
    if (!options?.disableCache && this.cachedCanvasTexture && now - this.lastCanvasUpdate < this.style.throttleMs) {
      return {
        texture: this.cachedCanvasTexture,
        aspect: this.lastAspect,
        contentHeightWorld: this.lastContentHeightWorld,
        cropX: this.lastCropX,
      };
    }
    this.lastCanvasUpdate = now;

    const dpr = this.computeDevicePixelRatio();
    const px = (value: number) => Math.round(value * dpr);

    const resources = this.normaliseResources(request.resources);
    const rowsCount = Math.max(this.style.minRows ?? 0, resources.length);

    const baseWidthPx = Math.max(2, this.style.textureWidthPx);
    const widthRaw = Math.round(baseWidthPx * dpr);

    const pad = px(this.style.outerPaddingPx);
    const rowH = px(this.style.rowHeightPx);
    const sectionGap = px(this.style.sectionGapPx);
    const progressH = showProgress ? px(this.style.progressHeightPx) : 0;
    const progressGap = showProgress ? sectionGap : 0;
    const titleLineHeight = request.title ? px(this.style.titleLineHeightPx) : 0;
    const titleGap = request.title ? px(this.style.titleGapPx) : 0;

    const heightRaw = pad + titleLineHeight + titleGap + progressH + progressGap + rowsCount * rowH + pad;

    const width = THREE.MathUtils.ceilPowerOfTwo(Math.max(2, widthRaw));
    const height = THREE.MathUtils.ceilPowerOfTwo(Math.max(2, heightRaw));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D context for HUD canvas');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);

    const safeFraction = THREE.MathUtils.clamp(this.style.safeHorizontalFraction, 0, 1);
    const safeW = Math.round(widthRaw * safeFraction);
    const safeX = Math.round((widthRaw - safeW) * 0.5);
    const safeRight = safeX + safeW;

    const contentLeft = safeX + px(this.style.sidePaddingPx);
    const contentRight = safeRight - px(this.style.sidePaddingPx);

    let cursorY = pad;

    if (request.title) {
      ctx.font = `${px(this.style.titleFontPx)}px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(request.title, contentLeft, cursorY);
      cursorY += titleLineHeight + titleGap;
    }

    if (showProgress) {
      const progressX = contentLeft;
      const progressW = Math.max(1, contentRight - contentLeft);
      const progressY = cursorY;
      const outline = px(this.style.progressOutlinePaddingPx);
      const minFill = px(this.style.progressMinFillPx);
      const progress = THREE.MathUtils.clamp(request.progress ?? 0, 0, 1);

      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(progressX - outline, progressY - outline, progressW + outline * 2, progressH + outline * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(progressX, progressY, progressW, progressH);

      const filled = Math.round(progressW * progress);
      const fillWidth = progress <= 0 ? 0 : Math.max(minFill, filled);
      if (fillWidth > 0) {
        ctx.fillStyle = '#12d06b';
        ctx.fillRect(progressX, progressY, Math.min(progressW, fillWidth), progressH);
      }

      cursorY += progressH + progressGap;
    }

    const gapSmall = px(this.style.gapSmallPx);
    const gapMedium = px(this.style.gapMediumPx);
    const iconSize = px(this.style.iconSizePx);
    const iconX = contentLeft;
    const nameX = iconX + iconSize + gapSmall;
    const reqColumnWidth = px(this.style.reqColumnWidthPx);
    const rightLimit = contentRight - reqColumnWidth;
    const availableBetween = Math.max(0, rightLimit - nameX - gapMedium);

    const nameMin = px(this.style.nameMinWidthPx);
    const barMin = px(this.style.barMinWidthPx);
    const barMax = px(this.style.barMaxWidthPx);
    const barHeight = px(this.style.barHeightPx);
    const barOutline = px(this.style.barOutlinePaddingPx);
    const barMinFill = px(this.style.barMinFillPx);

    const nameFont = `${px(this.style.nameFontPx)}px Inter, Arial, sans-serif`;
    const qtyFont = `${px(this.style.qtyFontPx)}px Inter, Arial, sans-serif`;
    const nameBaselineOffset = px(this.style.nameBaselineOffsetPx);

    const truncate = (text: string, maxWidth: number, font: string) => {
      ctx.font = font;
      if (maxWidth <= 0) return '…';
      if (ctx.measureText(text).width <= maxWidth) return text;
      const ellipsis = '…';
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = ((lo + hi) / 2) | 0;
        const candidate = text.slice(0, mid) + ellipsis;
        if (ctx.measureText(candidate).width <= maxWidth) lo = mid + 1; else hi = mid;
      }
      return text.slice(0, Math.max(0, lo - 1)) + ellipsis;
    };

    resources.forEach((resource, index) => {
      const rowTop = cursorY + index * rowH;
      const rowCenterY = rowTop + Math.round(rowH * 0.5);

      let nameMaxW = Math.round(availableBetween * 0.55);
      let barW = availableBetween - nameMaxW;

      if (nameMaxW < nameMin) {
        const deficit = nameMin - nameMaxW;
        nameMaxW += deficit;
        barW -= deficit;
      }

      if (barW < barMin) {
        const deficit = barMin - barW;
        barW += deficit;
        nameMaxW -= deficit;
      }

      nameMaxW = Math.max(nameMin, nameMaxW);
      barW = Math.min(barMax, Math.max(barMin, barW));

      const barX = nameX + nameMaxW + gapMedium;
      const reqX = contentRight;

      const resourceMeta = RESOURCES_DB[resource.id as ResourceId];
      const displayName = resourceMeta?.name ?? resource.id;
      const baseColor = resourceMeta?.color ?? '#cccccc';

      const required = Math.max(0, Number(resource.required) || 0);
      const collectedRaw = Math.max(0, Number(resource.collected) || 0);
      const collected = required > 0 ? Math.min(required, collectedRaw) : collectedRaw;
      const complete = required > 0 ? collected >= required : collectedRaw > 0;
      const ratio = required > 0 ? THREE.MathUtils.clamp(collected / Math.max(required, 1e-6), 0, 1) : 1;

      const iconY = rowCenterY - Math.round(iconSize / 2);
      this.drawResourceIcon(ctx, texture, resource.id, iconX, iconY, iconSize, complete ? '#12d06b' : baseColor);

      const nameY = rowCenterY + nameBaselineOffset;
      ctx.font = nameFont;
      ctx.fillStyle = complete ? '#12d06b' : '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      console.log('NameData: ', nameMaxW, nameMin, nameX, gapMedium, barX, availableBetween);
      ctx.fillText(truncate(displayName, nameMaxW, nameFont), nameX, nameY);

      const barY = rowCenterY - Math.round(barHeight / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(barX - barOutline, barY - barOutline, barW + barOutline * 2, barHeight + barOutline * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, barY, barW, barHeight);

      let fillWidth = complete ? barW : Math.round(barW * ratio);
      if (!complete && ratio > 0) {
        fillWidth = Math.max(barMinFill, fillWidth);
      }
      if (complete || ratio > 0) {
        ctx.fillStyle = complete ? '#12d06b' : '#ff4444';
        ctx.fillRect(barX, barY, Math.min(barW, fillWidth), barHeight);
      }

      ctx.font = qtyFont;
      ctx.fillStyle = '#e6e6e6';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(required)), reqX, rowCenterY);
    });

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    texture.needsUpdate = true;

    this.cachedCanvasTexture?.dispose?.();
    this.cachedCanvasTexture = texture;
    this.lastAspect = widthRaw / Math.max(1, heightRaw);
    this.lastContentHeightWorld = this.style.contentWorldHeight;
    this.lastCropX = safeFraction;

    return {
      texture,
      aspect: this.lastAspect,
      contentHeightWorld: this.lastContentHeightWorld,
      cropX: this.lastCropX,
    };
  }

  dispose(): void {
    this.cachedCanvasTexture?.dispose?.();
    this.cachedCanvasTexture = null;
  }

  private computeDevicePixelRatio(): number {
    const rendererRatio = this.renderer?.getPixelRatio?.();
    const windowRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return (rendererRatio ?? windowRatio ?? 1) * this.style.internalScale;
  }

  private normaliseResources(entries: HudResourceEntry[]): HudResourceEntry[] {
    return entries
      .map((entry) => ({
        id: entry.id,
        required: Math.max(0, Number(entry.required) || 0),
        collected: Math.max(0, Number(entry.collected) || 0),
      }))
      .filter((entry) => entry.required > 0 || entry.collected > 0);
  }

  private drawResourceIcon(
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
    resourceId: string,
    x: number,
    y: number,
    size: number,
    color: string
  ): void {
    const svgString = ResourceIcons.getIconForResource(resourceId, color);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      texture.needsUpdate = true;
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }
}
