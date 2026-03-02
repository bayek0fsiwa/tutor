import { base64ToUint8Array, createPCMBlob, decodeAudioData } from "@/lib/audioUtils";
import { INPUT_SAMPLE_RATE, MODEL, OUTPUT_SAMPLE_RATE } from "@/lib/constants";
import { GoogleGenAI, LiveServerMessage, Modality, Session } from "@google/genai";

export class LiveManager {
    private ai: GoogleGenAI;
    private activeSession: Session | null = null;
    private inputAudioContext: AudioContext | null = null;
    private outputAudioContext: AudioContext | null = null;
    private outputNode: GainNode | null = null;
    private mediaStream: MediaStream | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private inputSource: MediaStreamAudioSourceNode | null = null;
    private nextStartTime = 0;
    private sources = new Set<AudioBufferSourceNode>();

    constructor() {
        this.ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
    }

    async startSession() {
        console.log("Starting session");
        const config = {
            responseModalities: [Modality.AUDIO],
            systemInstructions: "You are a helpful and friendly assistant.",
        };
        this.activeSession = await this.ai.live.connect({
            model: MODEL,
            config: config,
            callbacks: {
                onopen: () => console.log("Connected to Gemini."),
                onmessage: this.handleMessage.bind(this),
                // onmessage: (message) => console.log("Message", message),
                onerror: (e) => console.error("Error", e.message),
                onclose: (e) => console.log("Closed", e.reason),
            },
        });

        this.inputAudioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
        this.outputAudioContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });

        if (this.inputAudioContext.state === "suspended") {
            this.inputAudioContext.resume();
        }

        if (this.outputAudioContext.state === "suspended") {
            this.outputAudioContext.resume();
        }

        this.outputNode = this.outputAudioContext.createGain();
        this.outputNode.connect(this.outputAudioContext.destination);
        await this.inputAudioContext.audioWorklet.addModule("/worklets/mic-processor.js");
        this.workletNode = new AudioWorkletNode(this.inputAudioContext, "mic-processor");
        this.workletNode.connect(this.inputAudioContext.destination);
        this.workletNode.port.onmessage = (event) => {
            const pcmBlob = createPCMBlob(event.data as Float32Array);
            this.activeSession?.sendRealtimeInput({ audio: pcmBlob });
        };
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: INPUT_SAMPLE_RATE,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        });

        this.inputSource = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
        this.inputSource.connect(this.workletNode);
        console.log("Active session", this.activeSession);
    }

    async handleMessage(message: LiveServerMessage) {
        const serverContent = message.serverContent;
        const base64Data = serverContent?.modelTurn?.parts?.[0].inlineData?.data;
        if (!base64Data) {
            return;
        }
        await this.playAudioChunk(base64Data as string);
        console.log("output context", this.inputAudioContext);
    }

    async playAudioChunk(audioData: string) {
        const uintData = base64ToUint8Array(audioData);
        if (!this.outputAudioContext || !this.outputNode) return;
        const audioBuffer = await decodeAudioData(uintData, this.outputAudioContext, OUTPUT_SAMPLE_RATE, 1);
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        source.addEventListener("ended", () => {
            this.sources.delete(source);
        });
        this.sources.add(source);
    }
}
