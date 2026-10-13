// Main-thread side of solc.worker.js. One worker per compiler version; asking
// for a different version replaces it.
let worker = null;
let workerUrl = null;
let seq = 0;

export function compileInWorker(url, input) {
  if (worker && workerUrl !== url) {
    worker.terminate();
    worker = null;
  }
  if (!worker) {
    worker = new Worker(new URL("./solc.worker.js", import.meta.url));
    workerUrl = url;
  }
  const w = worker;
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.output);
    };
    const onError = (e) => {
      cleanup();
      // A crashed worker can't be reused.
      w.terminate();
      if (worker === w) worker = null;
      reject(new Error(e.message || "The compiler crashed (the browser may have run out of memory)."));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, url, input });
  });
}
