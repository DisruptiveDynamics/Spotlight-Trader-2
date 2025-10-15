declare global {
  interface Window {
    __BUILD_ID__?: string;
  }
  const __BUILD_TIME__: string;
}
export {};
