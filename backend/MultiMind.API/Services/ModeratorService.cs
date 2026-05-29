using OpenAI;
using OpenAI.Chat;

namespace MultiMind.API.Services;

public interface IModeratorService
{
    Task<(ModeratorResult Result, int Tokens)> SynthesizeAsync(string originalPrompt, List<DebateTranscriptEntry> transcript);
}

public record ModeratorResult(
    string Recommendation,
    int ConfidenceScore,
    string KeyDissentingViewpoints,
    string FullSynthesis
);

public record DebateTranscriptEntry(int Round, string AgentType, string Response);

public class ModeratorService : IModeratorService
{
    private readonly ChatClient _client;

    private const string ModeratorSystemPrompt = """
        You are the Chair of a multi-expert decision panel. Three specialists have just completed a two-round debate:
        a Chief Strategy Officer (Strategist), a Risk Officer (Risk Analyst), and a Principal Engineer (Engineer).

        Your role is to deliver a balanced, authoritative synthesis that a senior decision-maker can act on immediately.
        You are not a mediator — you are the final voice. Your synthesis carries weight.

        Your synthesis must:
        1. Identify where the three experts genuinely agree and build on that common ground
        2. Name the most important unresolved tension between them, clearly and fairly
        3. Deliver a clear, actionable recommendation — not a hedge. If confidence is low, say why and what would change it
        4. Write in fluent, authoritative prose (not bullet points) that a CEO could quote in a board meeting

        Return your response as valid JSON with this exact structure:
        {
          "recommendation": "string — 1-3 sentences, direct and actionable",
          "confidenceScore": number (0-100),
          "keyDissentingViewpoints": "string — the main unresolved expert disagreement in 1-2 sentences",
          "fullSynthesis": "string — 3-5 paragraphs of narrative prose synthesis, written as flowing text"
        }

        Confidence scoring:
        - 80-100: Strong consensus across all three experts, minor tactical disagreements only
        - 60-79: Two experts broadly aligned, one significant dissenting view remains
        - 40-59: Meaningful disagreements across all three, path forward is genuinely unclear
        - Below 40: Fundamental contradictions — a conditional or staged approach should be recommended
        """;

    public ModeratorService(IConfiguration config)
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

    public async Task<(ModeratorResult Result, int Tokens)> SynthesizeAsync(string originalPrompt, List<DebateTranscriptEntry> transcript)
    {
        var transcriptText = string.Join("\n\n", transcript.Select(t =>
            $"[Round {t.Round} — {t.AgentType}]\n{t.Response}"));

        var userMessage = $"""
            Original decision/question:
            {originalPrompt}

            Debate transcript:
            {transcriptText}

            Provide your synthesis as JSON.
            """;

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(ModeratorSystemPrompt),
            new UserChatMessage(userMessage)
        };

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        var completion = await _client.CompleteChatAsync(messages,
            new ChatCompletionOptions { ResponseFormat = ChatResponseFormat.CreateJsonObjectFormat() },
            cancellationToken: cts.Token);

        var rawText = completion.Value.Content[0].Text?.Trim() ?? "";
        var tokens = completion.Value.Usage?.TotalTokenCount ?? 0;
        return (ParseModeratorJson(rawText), tokens);
    }

    /// <summary>Parses the raw JSON string returned by the AI (strips markdown fences if present).</summary>
    internal static ModeratorResult ParseModeratorJson(string rawText)
    {
        var json = rawText?.Trim() ?? "";
        // Strip markdown code block if present (e.g. ```json ... ``` or ``` ... ```)
        if (json.StartsWith("```"))
        {
            var firstNewline = json.IndexOf('\n');
            if (firstNewline >= 0) json = json[(firstNewline + 1)..];
            if (json.EndsWith("```")) json = json[..^3].TrimEnd();
        }
        var result = System.Text.Json.JsonSerializer.Deserialize<ModeratorJsonResult>(json,
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Failed to parse moderator response.");

        return new ModeratorResult(
            result.Recommendation,
            result.ConfidenceScore,
            result.KeyDissentingViewpoints,
            result.FullSynthesis
        );
    }

    private record ModeratorJsonResult(
        string Recommendation,
        int ConfidenceScore,
        string KeyDissentingViewpoints,
        string FullSynthesis
    );
}
