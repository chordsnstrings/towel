// Leave headroom for multipart boundaries and Netlify's Base64 request envelope.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
