/* eslint-env worker */
/* eslint-disable no-restricted-globals */
// Runs the Solidity compiler off the main thread. Recent soljson builds embed a
// >8 MB WebAssembly module that they compile synchronously, which Chrome only
// allows inside workers. Also keeps the page responsive during long compiles.
//
// Messages in:  { id, url, input }   url = soljson build, input = standard JSON
// Messages out: { id, output } | { id, error }
import setupSolcMethods from "solc/wrapper";

let solc = null;
let loadedUrl = null;

function loadSoljson(url) {
  return new Promise((resolve, reject) => {
    self.Module = { onRuntimeInitialized: () => resolve(self.Module) };
    try {
      importScripts(url);
    } catch (e) {
      reject(new Error(`Failed to load compiler build: ${e.message}`));
      return;
    }
    // Synchronous builds may finish initialising during importScripts.
    if (self.Module.calledRun) resolve(self.Module);
  });
}

self.onmessage = async ({ data: { id, url, input } }) => {
  try {
    if (loadedUrl !== url) {
      if (loadedUrl) throw new Error("This compiler worker already holds another version.");
      solc = setupSolcMethods(await loadSoljson(url));
      loadedUrl = url;
    }
    self.postMessage({ id, output: solc.compile(JSON.stringify(input)) });
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
