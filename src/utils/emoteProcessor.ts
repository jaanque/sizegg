import JSZip from 'jszip';

export interface ResizedItem {
	name: string;
	blob: Blob;
	width: number;
	height: number;
	previewUrl: string;
	category?: string;
}

export interface ProcessedFile {
	file: File;
	items: ResizedItem[];
	error?: string;
}

export interface PlatformConfig {
	id: 'twitch' | 'kick' | 'discord' | 'youtube' | '7tv' | 'bttv';
	sizes: { width: number; height: number; suffix?: string; category?: string }[];
	outputFormat?: 'png' | 'webp'; // default auto
}

export const platformConfigs: Record<string, PlatformConfig> = {
	twitch: {
		id: 'twitch',
		sizes: [
			{ width: 112, height: 112, suffix: '_112x112', category: 'EMOTES' },
			{ width: 56, height: 56, suffix: '_56x56', category: 'EMOTES' },
			{ width: 28, height: 28, suffix: '_28x28', category: 'EMOTES' },
			{ width: 72, height: 72, suffix: '_72x72', category: 'BADGES' },
			{ width: 36, height: 36, suffix: '_36x36', category: 'BADGES' },
			{ width: 18, height: 18, suffix: '_18x18', category: 'BADGES' }
		]
	},
	kick: {
		id: 'kick',
		sizes: [
			{ width: 500, height: 500, suffix: '_500x500', category: 'EMOTES' },
			{ width: 72, height: 72, suffix: '_72x72', category: 'BADGES' },
			{ width: 36, height: 36, suffix: '_36x36', category: 'BADGES' },
			{ width: 18, height: 18, suffix: '_18x18', category: 'BADGES' }
		]
	},
	discord: {
		id: 'discord',
		sizes: [
			{ width: 128, height: 128, suffix: '_128x128', category: 'EMOTES' }
		]
	},
	youtube: {
		id: 'youtube',
		sizes: [
			{ width: 480, height: 480, suffix: '_480x480', category: 'EMOTES' }
		]
	},
	'7tv': {
		id: '7tv',
		sizes: [
			{ width: 128, height: 128, suffix: '_128x128', category: 'EMOTES' }
		],
		outputFormat: 'webp'
	},
	bttv: {
		id: 'bttv',
		sizes: [
			{ width: 112, height: 112, suffix: '_112x112', category: 'EMOTES' },
			{ width: 56, height: 56, suffix: '_56x56', category: 'EMOTES' },
			{ width: 28, height: 28, suffix: '_28x28', category: 'EMOTES' }
		]
	}
};

/**
 * Redimensiona una imagen usando escalado profesional por etapas (Step-Down Resampling)
 * Preserva transparencias alpha y elimina el desenfoque o pixelado en tamaños pequeños (28x28, 56x56, 112x112).
 */
export async function resizeImage(
	file: File,
	targetWidth: number,
	targetHeight: number,
	mimeType: string = 'image/png'
): Promise<Blob> {
	const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

	// SI ES UN SVG: renderizado vectorial nativo de ultra-alta resolución (High-DPI Supersampling)
	if (isSvg) {
		return new Promise(async (resolve, reject) => {
			try {
				const text = await file.text();
				const parser = new DOMParser();
				const doc = parser.parseFromString(text, 'image/svg+xml');
				const svgEl = doc.querySelector('svg');

				if (!svgEl) {
					return reject(new Error('Invalid SVG markup'));
				}

				// Obtener viewBox original o construirlo desde width/height/bounding box
				let viewBox = svgEl.getAttribute('viewBox');
				if (!viewBox) {
					const w = parseFloat(svgEl.getAttribute('width') || '300');
					const h = parseFloat(svgEl.getAttribute('height') || '300');
					viewBox = `0 0 ${w} ${h}`;
					svgEl.setAttribute('viewBox', viewBox);
				}

				const vbParts = viewBox.split(/[\s,]+/).map(Number);
				const vbWidth = vbParts[2] || 300;
				const vbHeight = vbParts[3] || 300;

				// Renderizar primero a súper-alta densidad vectorial (mínimo 1024px o 4x el tamaño destino)
				const supersampleDim = Math.max(1024, targetWidth * 4);
				svgEl.setAttribute('width', supersampleDim.toString());
				svgEl.setAttribute('height', supersampleDim.toString());

				const serialized = new XMLSerializer().serializeToString(doc);
				const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
				const url = URL.createObjectURL(svgBlob);

				const img = new Image();
				img.onload = () => {
					URL.revokeObjectURL(url);

					// 1. Canvas súper-resolución donde el vector se dibuja 100% nítido a 1024px+
					let canvas = document.createElement('canvas');
					canvas.width = supersampleDim;
					canvas.height = supersampleDim;
					let ctx = canvas.getContext('2d');
					if (!ctx) return reject(new Error('Canvas 2D context not available'));

					ctx.clearRect(0, 0, supersampleDim, supersampleDim);
					ctx.imageSmoothingEnabled = true;
					ctx.imageSmoothingQuality = 'high';
					ctx.drawImage(img, 0, 0, supersampleDim, supersampleDim);

					let currentW = supersampleDim;
					let currentH = supersampleDim;

					// 2. Reduction paso a paso (Step-Down) desde los 1024px nítidos al tamaño objetivo
					while (currentW / 2 >= targetWidth && currentH / 2 >= targetHeight) {
						const nextW = Math.floor(currentW / 2);
						const nextH = Math.floor(currentH / 2);

						const stepCanvas = document.createElement('canvas');
						stepCanvas.width = nextW;
						stepCanvas.height = nextH;
						const stepCtx = stepCanvas.getContext('2d');
						if (stepCtx) {
							stepCtx.clearRect(0, 0, nextW, nextH);
							stepCtx.imageSmoothingEnabled = true;
							stepCtx.imageSmoothingQuality = 'high';
							stepCtx.drawImage(canvas, 0, 0, currentW, currentH, 0, 0, nextW, nextH);
						}
						canvas = stepCanvas;
						currentW = nextW;
						currentH = nextH;
					}

					// 3. Canvas final
					const finalCanvas = document.createElement('canvas');
					finalCanvas.width = targetWidth;
					finalCanvas.height = targetHeight;
					const finalCtx = finalCanvas.getContext('2d');
					if (!finalCtx) return reject(new Error('Final Canvas context not available'));

					finalCtx.clearRect(0, 0, targetWidth, targetHeight);
					finalCtx.imageSmoothingEnabled = true;
					finalCtx.imageSmoothingQuality = 'high';
					finalCtx.drawImage(canvas, 0, 0, currentW, currentH, 0, 0, targetWidth, targetHeight);

					finalCanvas.toBlob(
						(blob) => {
							if (blob) resolve(blob);
							else reject(new Error('Error generating image blob from SVG'));
						},
						mimeType,
						0.98
					);
				};

				img.onerror = () => {
					URL.revokeObjectURL(url);
					reject(new Error('Failed to render SVG file'));
				};

				img.src = url;
			} catch (err) {
				reject(err);
			}
		});
	}

	// PARA RASTERES (PNG, JPG, WebP, etc.): Escalado por etapas (Step-Down Resampling) sin recorte
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(url);

			const srcW = img.naturalWidth || img.width;
			const srcH = img.naturalHeight || img.height;

			// Calcular proporción para ajustar la imagen rectangular sin recortar ni deformar
			const scale = Math.min(targetWidth / srcW, targetHeight / srcH);
			const fitW = Math.max(1, Math.round(srcW * scale));
			const fitH = Math.max(1, Math.round(srcH * scale));
			const offsetX = Math.round((targetWidth - fitW) / 2);
			const offsetY = Math.round((targetHeight - fitH) / 2);

			// Canvas inicial con la imagen original completa (sin recorte 1:1)
			let currentCanvas = document.createElement('canvas');
			currentCanvas.width = srcW;
			currentCanvas.height = srcH;
			let ctx = currentCanvas.getContext('2d');
			if (!ctx) {
				return reject(new Error('Canvas 2D context not available'));
			}

			ctx.clearRect(0, 0, srcW, srcH);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(img, 0, 0, srcW, srcH);

			let currentW = srcW;
			let currentH = srcH;

			// Algoritmo por Etapas (Step-Down Scaling / Halving)
			while (currentW / 2 >= fitW && currentH / 2 >= fitH) {
				const nextW = Math.floor(currentW / 2);
				const nextH = Math.floor(currentH / 2);

				const stepCanvas = document.createElement('canvas');
				stepCanvas.width = nextW;
				stepCanvas.height = nextH;
				const stepCtx = stepCanvas.getContext('2d');
				if (stepCtx) {
					stepCtx.clearRect(0, 0, nextW, nextH);
					stepCtx.imageSmoothingEnabled = true;
					stepCtx.imageSmoothingQuality = 'high';
					stepCtx.drawImage(currentCanvas, 0, 0, currentW, currentH, 0, 0, nextW, nextH);
				}
				currentCanvas = stepCanvas;
				currentW = nextW;
				currentH = nextH;
			}

			// Paso final: Dibujar la imagen rectangular completa centrada en la resolución requerida
			const finalCanvas = document.createElement('canvas');
			finalCanvas.width = targetWidth;
			finalCanvas.height = targetHeight;
			const finalCtx = finalCanvas.getContext('2d');
			if (!finalCtx) {
				return reject(new Error('Final Canvas 2D context not available'));
			}

			finalCtx.clearRect(0, 0, targetWidth, targetHeight);
			finalCtx.imageSmoothingEnabled = true;
			finalCtx.imageSmoothingQuality = 'high';
			finalCtx.drawImage(currentCanvas, 0, 0, currentW, currentH, offsetX, offsetY, fitW, fitH);

			finalCanvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error('Error generating image blob'));
					}
				},
				mimeType,
				0.98
			);
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image file'));
		};

		img.src = url;
	});
}

/**
 * Procesa un archivo individual según la plataforma objetivo
 */
export async function processEmoteFile(
	file: File,
	platformId: string
): Promise<ProcessedFile> {
	const config = platformConfigs[platformId] || platformConfigs['twitch'];
	const baseName = file.name.replace(/\.[^/.]+$/, '');
	const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

	const items: ResizedItem[] = [];

	// Si es GIF animado, mantenemos el Blob original para garantizar que la animación GIF se reproduzca limpia y en movimiento en la pantalla
	if (isGif) {
		for (const s of config.sizes) {
			const suffix = s.suffix || `_${s.width}x${s.height}`;
			const filename = `${baseName}${suffix}.gif`;
			const previewUrl = URL.createObjectURL(file);

			items.push({
				name: filename,
				blob: file,
				width: s.width,
				height: s.height,
				previewUrl,
				category: s.category
			});
		}
		return { file, items };
	}

	// Imágenes estáticas (PNG, JPG, WebP, BMP, etc.)
	const outputMime = config.outputFormat === 'webp' ? 'image/webp' : 'image/png';
	const ext = config.outputFormat === 'webp' ? 'webp' : 'png';

	for (const s of config.sizes) {
		const suffix = s.suffix || `_${s.width}x${s.height}`;
		const filename = `${baseName}${suffix}.${ext}`;

		try {
			const blob = await resizeImage(file, s.width, s.height, outputMime);
			const previewUrl = URL.createObjectURL(blob);

			items.push({
				name: filename,
				blob,
				width: s.width,
				height: s.height,
				previewUrl,
				category: s.category
			});
		} catch (err: any) {
			return {
				file,
				items: [],
				error: err.message || 'Error processing file'
			};
		}
	}

	return { file, items };
}

/**
 * Genera y descarga un archivo .ZIP con todos los emotes procesados,
 * organizados en subcarpetas/directorios por cada imagen de origen.
 */
export async function downloadAllAsZip(processedFiles: ProcessedFile[], zipName: string = 'emotes.zip') {
	const zip = new JSZip();

	processedFiles.forEach((pf) => {
		// Crear carpeta por cada archivo usando el nombre base sin extensión
		const folderName = pf.file.name.replace(/\.[^/.]+$/, '');
		const folder = zip.folder(folderName) || zip;

		pf.items.forEach((item) => {
			folder.file(item.name, item.blob);
		});
	});

	const content = await zip.generateAsync({ type: 'blob' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(content);
	a.download = zipName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}
