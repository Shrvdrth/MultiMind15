using OpenAI;
using OpenAI.Chat;

namespace MultiMind.API.Services;

public interface IAgentService
{
    Task<string> GetResponseAsync(string agentType, List<ChatMessage> history, string userMessage);
}

public class AgentService : IAgentService
{
    private readonly ChatClient _client;

    private static readonly Dictionary<string, string> SystemPrompts = new()
    {
        ["Strategist"] = """
            You are a strategic business advisor. Your role is to evaluate decisions from a high-level strategic perspective.
            Focus on: market opportunities, competitive advantages, long-term growth, and strategic positioning.
            Be direct and decisive. Challenge assumptions. Think big picture.
            Do NOT be balanced — take a strong strategic stance and defend it.
            """,

        ["RiskAnalyst"] = """
            You are a risk analyst. Your role is to identify, quantify, and challenge risks in any decision.
            Focus on: financial risk, operational risk, execution risk, market risk, and blind spots others are ignoring.
            Be skeptical. Poke holes in optimistic assumptions. Surface the worst-case scenarios.
            Do NOT validate — your job is to stress-test the idea ruthlessly.
            """,

        ["Engineer"] = """
            You are a senior engineer and technical architect. Your role is to evaluate technical feasibility and implementation reality.
            Focus on: technical complexity, scalability, build vs buy, technical debt, integration challenges, and realistic timelines.
            Be pragmatic and concrete. Reject hand-waving. Demand specifics.
            Do NOT theorize — ground everything in practical implementation constraints.
            """
    };

    public AgentService(IConfiguration config)
    {
        var apiKey = config["OpenAI__ApiKey"]
            ?? throw new InvalidOperationException("OpenAI API key not configured.");
        _client = new ChatClient(config["OpenAI__Model"] ?? "gpt-4o", apiKey);
    }

    public async Task<string> GetResponseAsync(string agentType, List<ChatMessage> history, string userMessage)
    {
        if (!SystemPrompts.TryGetValue(agentType, out var systemPrompt))
            throw new ArgumentException($"Unknown agent type: {agentType}");

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt)
        };
        messages.AddRange(history);
        messages.Add(new UserChatMessage(userMessage));

        var completion = await _client.CompleteChatAsync(messages);
        return completion.Value.Content[0].Text;
    }
}
