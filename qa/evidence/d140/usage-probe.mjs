// D-140 probe: is Gemini Live usageMetadata per generation or cumulative? Synthetic text only; prints counts only.
import { createRequire } from "node:module";
const require = createRequire(process.argv[2]);
const { GoogleGenAI, Modality } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const reports = []; let turn = 0; let done;
const session = await ai.live.connect({
  model: "gemini-3.1-flash-live-preview",
  config: { responseModalities: [Modality.AUDIO], outputAudioTranscription: {} },
  callbacks: {
    onmessage: (m) => {
      if (m.usageMetadata) { const u = m.usageMetadata; reports.push({ turn, prompt: u.promptTokenCount, response: u.responseTokenCount, total: u.totalTokenCount, thoughts: u.thoughtsTokenCount, toolUse: u.toolUsePromptTokenCount, inMod: (u.promptTokensDetails||[]).map(d=>`${d.modality}:${d.tokenCount}`).join(","), outMod: (u.responseTokensDetails||[]).map(d=>`${d.modality}:${d.tokenCount}`).join(","), withTurnComplete: !!m.serverContent?.turnComplete }); }
      if (m.serverContent?.turnComplete) done?.();
    },
    onerror: (e) => console.log("error", e?.message), onclose: () => {},
  },
});
const qs = ["Say the word hello, nothing else.", "Now count from one to ten.", "Say goodbye in one short sentence."];
for (const q of qs) {
  turn++;
  const p = new Promise((r) => { done = r; setTimeout(r, 30000); });
  if (session.sendRealtimeInput) session.sendRealtimeInput({ text: q }); else session.sendClientContent({ turns: [{ role: "user", parts: [{ text: q }] }], turnComplete: true });
  await p; await new Promise((r) => setTimeout(r, 1500));
}
session.close();
console.log(JSON.stringify(reports, null, 1));
process.exit(0);
