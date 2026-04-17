import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { seedDoctors } from "./seedData.js";

const MAX_RETRIES  = 3;
const DYNAMO_TABLE = "medizyra-ai-conversations";

// All env vars read LAZILY inside functions so dotenv has time to load first.
// (ESM hoisting means top-level code in this file runs before dotenv.config()
//  in index.js, so process.env vars would be undefined if read here.)

let _bedrock = null;
function getBedrockClient() {
  if (!_bedrock) {
    const region = process.env.BEDROCK_REGION ?? "us-east-1";
    console.log(`[Bedrock] using region: ${region}`);
    _bedrock = new BedrockRuntimeClient({ region });
  }
  return _bedrock;
}

function getModelId() {
  return process.env.BEDROCK_MODEL_ID ?? "deepseek.deepseek-v3-20250324";
}

let _dynamo = null;
function getDynamoClient() {
  if (!_dynamo) {
    const region = process.env.AWS_REGION ?? "eu-north-1";
    _dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }
  return _dynamo;
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildDoctorCatalogue(doctors) {
  return doctors
    .map(
      (doc) =>
        `- ID: ${doc.id} | Name: ${doc.name} | Specialty: ${doc.specialty} | Clinic: ${doc.clinic} | Fee: INR ${doc.fee} | Focus: ${doc.focusAreas?.join(", ")}`,
    )
    .join("\n");
}

const SYSTEM_PROMPT = `You are MediZyra's patient health assistant. Your role is to help patients understand their symptoms and connect them with the right specialist from MediZyra's doctor catalogue.

AVAILABLE DOCTORS AT MEDIZYRA:
${buildDoctorCatalogue(seedDoctors)}

YOUR BEHAVIOUR RULES:
1. Only recommend doctors from the catalogue above — never suggest outside doctors or hospitals
2. Ask one or two follow-up questions if symptoms are vague before making a recommendation
3. Be warm, clear, and concise — patients may be anxious
4. Do not diagnose — you are a triage helper, not a doctor
5. Always clarify consultation mode and priority level

EMERGENCY RULE — if patient mentions any of these, immediately flag as emergency:
chest pain, difficulty breathing, sudden severe headache, loss of consciousness, stroke symptoms,
severe bleeding, poisoning, high fever in infant, severe allergic reaction

CONSULTATION MODE RULES:
- Recommend TELECONSULT for: follow-ups, mild fever, skin rashes, report reviews, minor infections,
  mental health check-ins, thyroid or hormone queries, mild digestive issues
- Recommend IN-CLINIC for: first visits, physical examination needed, children under 5,
  elderly patients over 70, anything requiring tests or scans, serious or worsening symptoms

PRIORITY RULES:
- Emergency: life-threatening symptoms — advise going to emergency room immediately, still provide doctor
- Urgent: symptoms worsening or lasting more than 5 days, significant pain
- Routine: mild, stable, or chronic management

RESPONSE FORMAT:
Have a natural conversation. When you have gathered enough information to make a confident recommendation,
end your message with this exact block — do not include it before you are ready:

<recommendation>
{
  "doctorId": "exact-id-from-catalogue",
  "doctorName": "Full Name",
  "specialty": "Specialty",
  "consultMode": "Teleconsult or In-clinic",
  "priority": "Routine or Urgent or Emergency",
  "reasonForVisit": "Short reason phrase suitable for appointment form",
  "suggestedSymptoms": "Comma-separated symptom summary from conversation"
}
</recommendation>

Only output the recommendation block once you are confident. If you are still gathering information, just continue the conversation naturally without the block.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Bedrock Converse requires strictly alternating user/assistant turns.
 * If the history somehow has two consecutive same-role messages (edge case),
 * merge them so the API doesn't reject the request.
 */
function normaliseMessages(messages) {
  const out = [];
  for (const msg of messages) {
    const bedrockRole = msg.role === "assistant" ? "assistant" : "user";
    if (out.length > 0 && out[out.length - 1].role === bedrockRole) {
      // Merge into the previous turn
      out[out.length - 1].content[0].text += "\n" + msg.content;
    } else {
      out.push({ role: bedrockRole, content: [{ text: msg.content }] });
    }
  }
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getAIRecommendation(conversationHistory) {
  const bedrockMessages = normaliseMessages(conversationHistory);

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const modelId = getModelId();
      console.log(`[Bedrock] invoking model: ${modelId}`);
      const command = new ConverseCommand({
        modelId,
        system: [{ text: SYSTEM_PROMPT }],
        messages: bedrockMessages,
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.7,
        },
      });

      const response = await getBedrockClient().send(command);
      return response.output.message.content[0].text;

    } catch (err) {
      const msg = err.message ?? "";
      const code = err.name ?? "";

      // Throttling / rate-limit — tell user to wait
      if (code === "ThrottlingException" || msg.toLowerCase().includes("throttl")) {
        throw Object.assign(
          new Error("The AI assistant is being throttled. Please wait a moment and try again."),
          { status: 429 },
        );
      }

      // Model not enabled / access denied
      if (code === "AccessDeniedException" || msg.toLowerCase().includes("access denied")) {
        throw new Error(
          `Model access denied for "${MODEL_ID}". Make sure you have enabled this model in the Bedrock console under Model Access.`,
        );
      }

      // Model not found / wrong ID
      if (code === "ValidationException" || msg.toLowerCase().includes("model") && msg.toLowerCase().includes("not found")) {
        throw new Error(
          `Model ID "${getModelId()}" not found in region "${process.env.BEDROCK_REGION}". Check BEDROCK_MODEL_ID and BEDROCK_REGION in your .env file.`,
        );
      }

      // Transient 5xx — back off and retry
      if (
        code === "ServiceUnavailableException" ||
        code === "InternalServerException" ||
        msg.includes("503") ||
        msg.includes("500")
      ) {
        lastError = err;
        const delay = 1200 * (attempt + 1);
        console.warn(`Bedrock transient error on attempt ${attempt + 1}, retrying in ${delay}ms…`);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }
  throw lastError;
}

// ── DynamoDB conversation log ─────────────────────────────────────────────────

export async function logConversation({ sessionId, messages, recommendation }) {
  try {
    await getDynamoClient().send(
      new PutCommand({
        TableName: DYNAMO_TABLE,
        Item: {
          sessionId,
          timestamp: new Date().toISOString(),
          messageCount: messages.length,
          recommendedDoctorId: recommendation?.doctorId ?? null,
          recommendedSpecialty: recommendation?.specialty ?? null,
          consultMode: recommendation?.consultMode ?? null,
          priority: recommendation?.priority ?? null,
          symptoms: recommendation?.suggestedSymptoms ?? null,
          ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90, // 90-day auto-expire
        },
      }),
    );
  } catch (err) {
    console.warn("AI conversation log failed:", err.message);
  }
}
