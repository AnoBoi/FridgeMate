// JavaScript source code

// Import Scanbot SDK from CDN (works on Firebase Hosting)
import "https://cdn.jsdelivr.net/npm/scanbot-web-sdk@latest/bundle/ScanbotSDK.ui2.min.js";

// License key
const LICENSE_KEY =
    "fRx/61cEL9V7wbzgconZppF0XaLXdc" +
    "B+PfvOWuvlfrzgYr4LjNTqNxtxrk94" +
    "wfDVhwyZZXXyT/D9JROWEYVRjFLkY2" +
    "ojZ1KMjz8UBAEHiMA2IVz22M8G/mn5" +
    "YHH/raVVq5EiedWRGhmn3utYIGTOU1" +
    "yiVy1EXzyEWyXAcHP6VPlMjnEtxQFD" +
    "lANK6pHjVwVO8lTv1eK6nSFjrQe/pd" +
    "sm0R9CkQsPKxos0TribuDFfOJ1Luqv" +
    "utxdcE3/o6I1wJGl4RHcKqAYN/0qj4" +
    "biqxIzfuj3WGVWqA4GciTyO4bN6VAX" +
    "qo5PkB9A8A4C2RQTLXgl9Eb0NTcFSx" +
    "bplPwv7tlG6A==\nU2NhbmJvdFNESw" +
    "psb2NhbGhvc3R8bG9jYWxob3N0OjU1" +
    "MDAKMTc2Mzk0MjM5OQo4Mzg4NjA3Cj" +
    "g=\n";

let sdkInstance = null;

// Initialize the SDK once
async function initializeScanbotSDK() {
    if (sdkInstance) {
        return sdkInstance;
    }

    try {
        sdkInstance = await ScanbotSDK.initialize({
            license: LICENSE_KEY,
            // Use CDN for enginePath - works on Firebase Hosting
            enginePath: "https://cdn.jsdelivr.net/npm/scanbot-web-sdk@latest/bundle/bin/complete/",
        });
        console.log("Scanbot SDK initialized successfully");
        return sdkInstance;
    } catch (e) {
        console.error("SDK Initialization failed:", e);
        throw e;
    }
}

// Export function to launch barcode scanner
export async function launchBarcodeScanner() {
    let container = null;
    let scannerInstance = null;

    try {
        const sdk = await initializeScanbotSDK();

        const scannerId = 'scanbot-camera-container';
        container = document.getElementById(scannerId);

        if (!container) {
            container = document.createElement('div');
            container.id = scannerId;
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.zIndex = '9999';
            container.style.backgroundColor = '#000';
            document.body.appendChild(container);
        }

        console.log("Launching barcode scanner...");

        // Return a Promise that resolves when a barcode is detected
        return new Promise((resolve, reject) => {
            const config = {
                containerId: scannerId,
                barcodeFormats: ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "CODE_39", "QR_CODE"],
                video: {
                    facingMode: "environment",
                },
                style: {
                    window: {
                        width: "100%",
                        height: "100%",
                    },
                    finderLineColor: "#00B291"
                },
                text: {
                    hint: "Point camera at barcode"
                },
                // This callback is called when barcodes are detected
                onBarcodesDetected: (result) => {
                    console.log("Barcodes detected:", result);

                    if (result && result.barcodes && result.barcodes.length > 0) {
                        const barcode = result.barcodes[0];

                        console.log("First barcode:", barcode);

                        // Dispose the scanner
                        if (scannerInstance && scannerInstance.dispose) {
                            scannerInstance.dispose();
                        }

                        // Clean up container
                        if (container && container.parentNode) {
                            container.parentNode.removeChild(container);
                        }

                        // Resolve with barcode data
                        resolve({
                            success: true,
                            type: barcode.format || barcode.type || "UNKNOWN",
                            text: barcode.text || barcode.data || ""
                        });

                        return true; // Return true to stop scanning
                    }

                    return false; // Continue scanning
                }
            };

            // Create the scanner - this returns the scanner instance, not the result
            sdk.createBarcodeScanner(config)
                .then(instance => {
                    scannerInstance = instance;
                    console.log("Scanner created and waiting for barcode...");

                    // Add a cancel button
                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = '✕ Cancel';
                    cancelBtn.style.cssText = `
                        position: absolute;
                        top: 20px;
                        right: 20px;
                        z-index: 10000;
                        padding: 12px 24px;
                        background-color: rgba(254, 90, 90, 0.9);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    `;

                    cancelBtn.addEventListener('click', () => {
                        console.log("Scanning cancelled by user");

                        if (scannerInstance && scannerInstance.dispose) {
                            scannerInstance.dispose();
                        }

                        if (container && container.parentNode) {
                            container.parentNode.removeChild(container);
                        }

                        resolve({
                            success: false,
                            message: "Scanning cancelled by user"
                        });
                    });

                    container.appendChild(cancelBtn);
                })
                .catch(error => {
                    console.error("Failed to create scanner:", error);

                    if (container && container.parentNode) {
                        container.parentNode.removeChild(container);
                    }

                    reject(error);
                });
        });

    } catch (error) {
        console.error("Barcode scanning error:", error);

        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }

        return {
            success: false,
            message: error.message || "Failed to scan barcode"
        };
    }
}

// Auto-initialize on load
initializeScanbotSDK().catch(err => {
    console.error("Failed to auto-initialize Scanbot SDK:", err);
});