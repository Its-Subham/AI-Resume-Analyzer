export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    isLoading = true;
    
    try {
        // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not a module
        loadPromise = import("pdfjs-dist/build/pdf.mjs").then((lib) => {
            // Set the worker source to use local file
            lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
            pdfjsLib = lib;
            isLoading = false;
            console.log("PDF.js loaded successfully");
            return lib;
        }).catch((error) => {
            console.error("Failed to load PDF.js:", error);
            isLoading = false;
            throw error;
        });

        return loadPromise;
    } catch (error) {
        isLoading = false;
        console.error("Error in loadPdfJs:", error);
        throw error;
    }
}


export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    try {
        console.log("Starting PDF conversion for file:", file.name, "Size:", file.size);
        
        // Validate file
        if (!file || file.size === 0) {
            throw new Error("Invalid or empty file");
        }
        
        if (!file.type.includes('pdf')) {
            throw new Error("File is not a PDF");
        }

        const lib = await loadPdfJs();
        console.log("PDF.js library loaded");

        const arrayBuffer = await file.arrayBuffer();
        console.log("File converted to ArrayBuffer, size:", arrayBuffer.byteLength);
        
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        console.log("PDF document loaded, pages:", pdf.numPages);
        
        const page = await pdf.getPage(1);
        console.log("First page loaded");

        const viewport = page.getViewport({ scale: 2 }); // Reduced scale for better performance
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Failed to get canvas context");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        console.log("Canvas created with dimensions:", canvas.width, "x", canvas.height);

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        await page.render({ canvasContext: context, viewport }).promise;
        console.log("Page rendered to canvas");

        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        console.log("Blob created successfully, size:", blob.size);
                        // Create a File from the blob with the same name as the pdf
                        const originalName = file.name.replace(/\.pdf$/i, "");
                        const imageFile = new File([blob], `${originalName}.png`, {
                            type: "image/png",
                        });

                        resolve({
                            imageUrl: URL.createObjectURL(blob),
                            file: imageFile,
                        });
                    } else {
                        console.error("Failed to create image blob");
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: "Failed to create image blob",
                        });
                    }
                },
                "image/png",
                0.9 // Slightly reduced quality for better performance
            );
        });
    } catch (err) {
        console.error("PDF conversion error:", err);
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}