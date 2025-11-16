// JavaScript source code

// 🚨 IMPORTANT: Adjust this import path to where your Scanbot SDK bundle is located
import "https://AnoBoi.github.io/FridgeMate/scanbot-web-sdk/bundle/ScanbotSDK.ui2.min.js";

// Replace 'YOUR_SCANBOT_LICENSE_KEY' with your actual key
const LICENSE_KEY = "Q3Av52D/P+BAewHQaLnwnmp6mgIKnw" +
  "g/ULGghR6BfUVTeX/A46rxbhCfVaYw" +
  "MA2LkAA3EYFGahSLO713VLP6K0ddlA" +
  "ZeKFb7JbYcDWIdGfDe59/sKvq02O9Y" +
  "sv0dvE2HypKApj8sVctIhlqJxAlHAc" +
  "Sd4p5gpTwfo+v/C7c4D681LftUM/2U" +
  "k2Vyeo1e5isNal8Ruy4D1Tq/d1dHLJ" +
  "fUfRhNm7rmoY/pLzzeYkFeS/Epb9Qb" +
  "C92PBRcGRhhnMzLYPJvE1DmlFSiWC/" +
  "IXZY1Jl+jYugiBsqttNOCvDwVAoEpJ" +
  "wCGhdKTUekpWZBVhbtCZFFbXtu8z77" +
  "GLc913qGX5/g==\nU2NhbmJvdFNESw" +
  "psb2NhbGhvc3R8ZnJpZGdlLW1hdGUt" +
  "MzFlOTcud2ViLmFwcAoxNzYzODU1OT" +
  "k5CjgzODg2MDcKOA==\n";

// --- Main execution function ---
(async () => {
    try {
        // 1. Initialize the SDK
        const sdk = await ScanbotSDK.initialize({
            license: LICENSE_KEY,
            // wasmDirectory: "path/to/scanbot-web-sdk/bundle/" // Optional
        });

        // 2. Wait for the DOM to be fully loaded before looking for the button
        document.addEventListener('DOMContentLoaded', () => {
            const startButton = document.getElementById("start-scanning");
            if (!startButton) {
                console.error("Button with ID 'start-scanning' not found.");
                return;
            }

            // 3. Hook up the button functionality
            startButton.addEventListener("click", async () => {
                
                // --- Core Code: Runs when the button is clicked ---
                
                // Configuration for the pop-up scanner
                const config = new ScanbotSDK.UI.Config.BarcodeScannerConfiguration();
                
                config.finderLineColor = "#00B291"; // Example customization
                
                // LAUNCH THE POP-UP SCANNER
                const scanResult = await ScanbotSDK.UI.createBarcodeScanner(config);

                // Process the result after the pop-up closes
                const resultElement = document.getElementById("result");
                if (scanResult?.items?.length > 0) {
                    const barcode = scanResult.items[0];
                    resultElement.innerText = 
                        `✅ Success!\nType: ${barcode.type}\nContent: "${barcode.text}"`;
                } else {
                    resultElement.innerText = "❌ Scanning aborted by the user or no barcode found.";
                }
            });
        });

    } catch (e) {
        console.error("SDK Initialization failed:", e);
        // Display error message on the page
        document.addEventListener('DOMContentLoaded', () => {
            const resultElement = document.getElementById("result");
            if (resultElement) {
                resultElement.innerText = "Error: SDK could not initialize. Check console for details.";
            }
        });
    }
})();