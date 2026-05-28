using OpenAI;
using OpenAI.Chat;

namespace MultiMind.API.Services;

public interface IAgentService
{
    Task<(string Text, int Tokens)> GetResponseAsync(string agentType, List<ChatMessage> history, string userMessage);
    IAsyncEnumerable<string> GetResponseStreamingAsync(string agentType, List<ChatMessage> history, string userMessage, Action<int>? onTokensUsed = null, CancellationToken ct = default);
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
        var apiKey = config["OpenAI:ApiKey"]
            ?? throw new InvalidOperationException("OpenAI API key not configured.");
        var model = config["OpenAI:Model"] ?? "gpt-4o";
        var baseUrl = config["OpenAI:BaseUrl"];

        if (!string.IsNullOrEmpty(baseUrl))
        {
            var options = new OpenAIClientOptions
            {
                Endpoint = new Uri(baseUrl),
                NetworkTimeout = TimeSpan.FromSeconds(90)
            };
            _client = new ChatClient(model, new System.ClientModel.ApiKeyCredential(apiKey), options);
        }
        else
        {
            _client = new ChatClient(model, apiKey);
        }
    }

    public async Task<(string Text, int Tokens)> GetResponseAsync(string agentType, List<ChatMessage> history, string userMessage)
    {
        if (!SystemPrompts.TryGetValue(agentType, out var systemPrompt))
            throw new ArgumentException($"Unknown agent type: {agentType}");

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt)
        };
        messages.AddRange(history);
        messages.Add(new UserChatMessage(userMessage));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        var completion = await _client.CompleteChatAsync(messages, cancellationToken: cts.Token);
        var tokens = completion.Value.Usage?.TotalTokenCount ?? 0;
        return (completion.Value.Content[0].Text, tokens);
    }

    public async IAsyncEnumerable<string> GetResponseStreamingAsync(
        string agentType,
        List<ChatMessage> history,
        string userMessage,
        Action<int>? onTokensUsed = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        if (!SystemPrompts.TryGetValue(agentType, out var systemPrompt))
            throw new ArgumentException($"Unknown agent type: {agentType}");

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt)
        };
        messages.AddRange(history);
        messages.Add(new UserChatMessage(userMessage));

        int capturedTokens = 0;
        await foreach (var update in _client.CompleteChatStreamingAsync(messages, cancellationToken: ct))
        {
            // The final streaming update carries the usage summary
            if (update.Usage is { TotalTokenCount: > 0 } usage)
                capturedTokens = usage.TotalTokenCount;

            foreach (var part in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(part.Text))
                    yield return part.Text;
            }
        }

        onTokensUsed?.Invoke(capturedTokens);
    }
}
