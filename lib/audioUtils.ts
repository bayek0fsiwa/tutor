export function createPCMBlob(data: Float32Array) {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
        const element = Math.max(-1, Math.min(1, data[i]));
        int16[i] = element < 0 ? element * 32768 : element * 32767;
    }
    return {
        data: arrayBufferToBase64(int16),
        mimeType: "audio/pcm;rate=16000",
    };
}

function arrayBufferToBase64(data: Int16Array) {
    const bytes = new Uint8Array(data.buffer);
    let str = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str);
}
