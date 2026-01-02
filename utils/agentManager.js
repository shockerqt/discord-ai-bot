import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
let cachedAgentId = null;

const AGENT_NAME = "Discord OmniBot";
const AGENT_INSTRUCTIONS = "You are a helpful and creative AI assistant for a Discord community. You can chat about anything. If the user asks for an image, drawing, or visual representation, use the image generation tool to create it. Always be polite and concise.";

export async function getOmniAgentId() {
    if (cachedAgentId) return cachedAgentId;

    try {
        // 1. List existing agents to see if we already created one
        // Note: Pagination implies we might miss it if we have 100+ agents, but for        // 1. List existing agents
        const agentsList = await client.beta.agents.list();

        // Robust check: API might return array directly or { data: [] }
        const agents = Array.isArray(agentsList) ? agentsList : (agentsList.data || []);

        const existingAgent = agents.find(a => a.name === AGENT_NAME);

        if (existingAgent) {
            console.log(`Found existing agent: ${existingAgent.id}`);
            cachedAgentId = existingAgent.id;
            return existingAgent.id;
        }

        // 2. Create new agent if not found
        console.log("Creating new OmniBot Agent...");
        const newAgent = await client.beta.agents.create({
            model: "mistral-large-latest", // Base model for the agent
            name: AGENT_NAME,
            description: "An all-purpose agent with image generation capabilities for Discord.",
            instructions: AGENT_INSTRUCTIONS,
            tools: [
                {
                    type: "image_generation"
                }
            ],
            // Correction: The user snippet used `client.beta.agents.create`. 
            // The SDK structure might be slightly different.
            // Let's check imports. SDK v1 usually exports Mistral directly.
        });

        // Re-reading user snippet:
        // tools:[{ type: "image_generation" }]
        // I will try to use the user's exact syntax. 
        // However, standard function calling usually requires 'type: function'. 
        // If Mistral has a native 'image_generation' tool type exposed in the API, we use that.
        // User snippet: tools:[{ type: "image_generation" }]

        // Wait, I cannot edit the creation call easily if it fails at runtime here. 
        // I will stick to the user's snippet logic.

        console.log(`Created new agent: ${newAgent.id}`);
        cachedAgentId = newAgent.id;
        return newAgent.id;

    } catch (error) {
        console.error("Error getting/creating agent:", error);
        // Fallback to a default model if agent creation fails, though conversation API needs an agent_id or model.
        throw error;
    }
}
