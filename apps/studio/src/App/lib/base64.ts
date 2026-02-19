export const toBase64 = (data: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(data);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};
