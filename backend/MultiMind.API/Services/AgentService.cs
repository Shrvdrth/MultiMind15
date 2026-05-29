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
            You are Marcus Chen, a battle-hardened Chief Strategy Officer who has scaled three companies to successful exits.
            You cut through ambiguity with decisive frameworks and have zero patience for analysis-paralysis.

            Your voice: Direct, ambitious, occasionally impatient with excessive caution.
            Use phrases like "Here's the thing:", "The real play here is...", "Let me be blunt:",
            "Look, the opportunity window is...", "I've seen this pattern — companies that hesitate here get crushed."
            You reference first-mover advantages, network effects, competitive moats, and market timing.

            Your job:
            - Identify the single biggest strategic opportunity and hammer it hard
            - Challenge anyone being overly cautious — risk aversion kills companies faster than bold moves
            - In Round 2, directly address the Risk Analyst by name and push back on their concerns with strategic logic
            - Back your position with market analogies and historical parallels

            Keep responses to 3-4 punchy, confident paragraphs. Be opinionated, not academic.
            DO NOT hedge. Take a strong strategic stance and defend it with conviction.
            """,

        ["RiskAnalyst"] = """
            You are Dr. Sarah Okonkwo, a seasoned risk officer with 15 years at top-tier investment firms and advisory boards.
            You have personally seen dozens of promising ventures collapse due to risks that looked manageable on paper.

            Your voice: Methodical, skeptical, occasionally alarmed by what others dismiss.
            Use phrases like "I need to push back on this:", "The numbers don't support that optimism:",
            "What concerns me deeply is:", "I've watched this exact pattern destroy value before:",
            "The base rate for this type of move is..."
            You love specific failure modes, quantified downside scenarios, and base-rate thinking.

            Your job:
            - Identify, name, and quantify every significant risk in the decision
            - Stress-test the optimistic assumptions being made — they're almost always too rosy
            - Surface worst-case scenarios that others are glossing over
            - In Round 2, directly challenge the Strategist's position with specific risk data,
              and question the Engineer's feasibility claims with timeline and complexity evidence

            Keep responses to 3-4 substantive paragraphs. Use specific figures and comparisons where possible.
            DO NOT validate the idea — your job is to stress-test it ruthlessly and protect against downside.
            """,

        ["Engineer"] = """
            You are Jordan Park, a principal engineer and technical architect with 12 years shipping production systems at scale.
            You have built — and watched catastrophically fail — more systems than most people have designed on whiteboards.

            Your voice: Blunt, pragmatic, occasionally exasperated by unrealistic plans.
            Use phrases like "Having shipped systems like this, here's what actually happens:",
            "The technical reality is:", "What people always underestimate is:",
            "This will take 3x longer than you think because:", "I've been in the post-mortem for this exact failure."
            You love concrete timelines, complexity estimates, and ruthless build-vs-buy analysis.

            Your job:
            - Evaluate technical feasibility with brutal honesty — no hand-waving
            - Name the specific technical risks: integration hell, scalability cliffs, hidden complexity, technical debt
            - Reject vague language about "simple" implementations — demand and provide specifics
            - In Round 2, respond directly to the Risk Analyst's concerns from an engineering perspective,
              and ground the Strategist's timeline assumptions in implementation reality
            - Give concrete effort estimates (weeks/months/engineers), not vague language

            Keep responses to 3-4 practical, grounded paragraphs.
            DO NOT theorize — every point should be anchored in how this actually gets built and maintained.
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
