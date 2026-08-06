/**
 * Download helpers for rendered Mermaid SVG diagrams.
 */

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
  return base || 'diagram';
}

function ensureSvgNamespace(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  return clone;
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = ensureSvgNamespace(svg);
  return new XMLSerializer().serializeToString(clone);
}

export function downloadMermaidSvg(svg: SVGSVGElement, title = 'diagram'): void {
  const markup = serializeSvg(svg);
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(title)}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Rasterize an SVG to PNG via an offscreen canvas.
 * Falls back gracefully if the browser blocks canvas/tainted drawing.
 */
export async function downloadMermaidPng(
  svg: SVGSVGElement,
  title = 'diagram',
  scale = 2
): Promise<void> {
  const markup = serializeSvg(svg);
  const bbox = svg.getBoundingClientRect();
  const attrW = Number.parseFloat(svg.getAttribute('width') || '');
  const attrH = Number.parseFloat(svg.getAttribute('height') || '');
  const viewBox = svg.viewBox?.baseVal;
  const width = Math.max(
    1,
    Math.ceil(attrW || viewBox?.width || bbox.width || svg.clientWidth || 800)
  );
  const height = Math.max(
    1,
    Math.ceil(attrH || viewBox?.height || bbox.height || svg.clientHeight || 600)
  );

  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(image, 0, 0, width, height);

    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          reject(new Error('PNG encoding failed'));
          return;
        }
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${sanitizeFilename(title)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyMermaidCode(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}
