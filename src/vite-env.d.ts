/// <reference types="vite/client" />

/** Injected by Vite from package.json — see the `define` block in vite.config.ts. */
declare const __APP_VERSION__: string;

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
