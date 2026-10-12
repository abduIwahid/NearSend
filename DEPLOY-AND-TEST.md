# NearSend deployment and test checklist

1. Upload the contents of this folder to the root of the GitHub repository (not the ZIP itself).
2. Confirm `public/index.html`, `public/js/app.js`, `public/js/ui.js`, `api/qr.js`, `api/ws.js`, `server/signaling.js`, `package.json`, and `vercel.json` are present at the expected paths.
3. Wait for the Vercel deployment to finish successfully.
4. Open the site in a private/incognito tab or clear site data so cached JavaScript is not reused.
5. Test Generate QR Code, Scan QR Code, Choose files, and device request on two devices.

This source has syntax checks, but real-device WebRTC and Vercel deployment behavior must still be tested on the deployed site.
