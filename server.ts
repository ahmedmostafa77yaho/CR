import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Wait for GEMINI_API_KEY to be available or handle explicitly
const getAiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  return new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// API route for extracting WhatsApp info
app.post("/api/analyze-receipt", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
       res.status(400).json({ error: "Missing text payload" });
       return;
    }
    
    const ai = getAiClient();
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        name_english: {
          type: Type.STRING,
          description: "Full English name of the registrant, if present.",
        },
        name_arabic: {
          type: Type.STRING,
          description: "Full Arabic name of the registrant, if present.",
        },
        university: {
          type: Type.STRING,
          description: "University name (e.g., Zagazig University, Cairo University), if present.",
        },
        level: {
          type: Type.STRING,
          description: "Academic level/year or graduation year (e.g., 'Level 5 / 2027'), if present.",
        },
        whatsapp_no: {
          type: Type.STRING,
          description: "Cleaned digits-only string containing the Whatsapp number.",
        },
        course_name: {
          type: Type.STRING,
          description: "Name of the course being registered for.",
        },
        price: {
          type: Type.NUMBER,
          description: "Price numeric amount, just the number.",
        },
        key_person: {
          type: Type.STRING,
          description: "Referrer name (someone explicitly mentioned as key person, contact, or from the last standalone line usually reflecting the agent/referrer name).",
        }
      },
      required: ["whatsapp_no"]
    };

    const runWithRetry = async (retriesLeft = 3, delayMs = 1000): Promise<any> => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Extract the requested fields from this WhatsApp registration message:\n\n${text}`,
          config: {
            systemInstruction: "You are a precise data-extraction AI. Ensure fields are correctly populated. Names can be English, Arabic, or mixed. Digits only for whatsapp_no. Clean spaces.",
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });
        return response;
      } catch (error: any) {
        const errorMsg = String(error.message || "");
        const isRateLimitOr503 = errorMsg.includes("503") || 
                                 errorMsg.includes("demand") || 
                                 errorMsg.includes("UNAVAILABLE") || 
                                 errorMsg.includes("Resource has been exhausted") || 
                                 errorMsg.includes("429");
        
        if (isRateLimitOr503 && retriesLeft > 0) {
          console.log(`Gemini API busy (503/429). Retrying in ${delayMs}ms... (${retriesLeft} retries remaining)`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return runWithRetry(retriesLeft - 1, delayMs * 2);
        }
        throw error;
      }
    };

    const response = await runWithRetry();

    const jsonStr = response.text?.trim() || "{}";
    const data = JSON.parse(jsonStr);

    res.json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  }
});

// Vite middleware for development (Loaded dynamically here)
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Only start server locally, on Vercel the default export is handled by the platform
if (process.env.NODE_ENV !== "production") {
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
