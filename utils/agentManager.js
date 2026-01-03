import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
let cachedAgentId = null;

const AGENT_NAME = "Zavier Sama";
const AGENT_INSTRUCTIONS = "You are Zavier Sama, a sophisticated and distinct AI personality. You are helpful, creative, and engaging.";

export async function getOmniAgentId() {
    if (cachedAgentId) return cachedAgentId;

    try {
        // 1. List existing agents to see if we already created one
        const agentsList = await client.beta.agents.list();
        const agents = Array.isArray(agentsList) ? agentsList : (agentsList.data || []);

        // Look for our specific agent
        const existingAgent = agents.find(a => a.name === AGENT_NAME);

        if (existingAgent) {
            console.log(`Found existing agent: ${existingAgent.id}`);
            cachedAgentId = existingAgent.id;
            return existingAgent.id;
        }

        // 2. Create new agent if not found
        console.log(`Creating new agent: ${AGENT_NAME}...`);
        const newAgent = await client.beta.agents.create({
            model: "mistral-large-latest",
            name: AGENT_NAME,
            description: "A sophisticated AI assistant named Zavier Sama.",
            instructions: AGENT_INSTRUCTIONS,
            // tools: [{ type: "image_generation" }], // Disabled to allow rate limit recovery
            temperature: 0.7, // Default temperature if supported at top level, otherwise ignored
        });

        console.log(`Created new agent: ${newAgent.id}`);
        cachedAgentId = newAgent.id;
        return newAgent.id;

    } catch (error) {
        console.error("Error getting/creating agent:", error);
        throw error;
    }
}

export async function updateAgentPersona(instructions, temperature, enableImageGen) {
    try {
        const agentId = await getOmniAgentId();
        console.log(`Updating agent ${agentId} with new persona...`);

        // Prepare update object compliant with AgentsApiV1AgentsUpdateRequest
        const updatePayload = {
            agentId: agentId,
            agentUpdateRequest: {
            }
        };

        if (instructions) {
            updatePayload.agentUpdateRequest.instructions = instructions;
        }

        if (temperature !== undefined) {
            updatePayload.agentUpdateRequest.completionArgs = {
                temperature: temperature
            };
        }

        if (enableImageGen !== undefined) {
            // If true, add the tool. If false, clear tools (or at least remove image_gen).
            // Assuming we only manage image_generation for now.
            updatePayload.agentUpdateRequest.tools = enableImageGen ? [{ type: "image_generation" }] : [];
        }

        const updatedAgent = await client.beta.agents.update(updatePayload);
        console.log(`Agent updated: ${updatedAgent.id}`);
        return updatedAgent;

    } catch (error) {
        console.error("Error updating agent persona:", error);
        throw error;
    }
}

export async function getAgentPersona() {
    try {
        const agentId = await getOmniAgentId();
        const agent = await client.beta.agents.get({ agentId });
        return agent;
    } catch (error) {
        console.error("Error fetching agent persona:", error);
        throw error;
    }
}
