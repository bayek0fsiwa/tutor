import { MODEL } from "@/lib/constants";
import { GoogleGenAI, Modality, Session } from "@google/genai";

export class LiveManager {
    private ai: GoogleGenAI;
    private activeSession: Session | null = null;

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
                onopen: () => {
                    console.log("Connected to service.");
                },
                onmessage: (message) => console.log("Message", message),
                onerror: (e) => console.error("Error", e.message),
                onclose: (e) => console.log("Closed", e.reason),
            },
        });
        console.log("Active session", this.activeSession);

    }
}
