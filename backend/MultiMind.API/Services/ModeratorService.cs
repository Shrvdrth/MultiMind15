using OpenAI;
using OpenAI.Chat;

namespace MultiMind.API.Services;

public interface IModeratorService
{
    Task<ModeratorResult> SynthesizeAsync(string originalPrompt, List<DebateTranscriptEntry> transcript);
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
        You are the Moderator of a multi-agent decision analysis panel.
        You have received responses from three agents: Strategist, Risk Analyst, and Engineer.
        They have debated a decision across multiple rounds.

        Your job:
        1. Synthesize the strongest arguments from all agents.
        2. Resolve or clearly state unresolved contradictions.
        3. Produce a clear, actionable final recommendation.
        4. Identify the key dissenting viewpoints that were not resolved.

        Return your response as valid JSON with this exact structure:
        {
          "recommendation": "string",
          "confidenceScore": number (0-100),
          "keyDissentingViewpoints": "string",
          "fullSynthesis": "string"
        }

        The confidenceScore must reflect genuine agreement level between agents:
        - 80-100: All agents broadly aligned, minor disagreements
        - 60-79: Two agents aligned, one significant dissent
        - 40-59: Significant disagreements across all agents
        - Below 40: Fundamental contradictions, low certainty
        """;

    public ModeratorService(IConfiguration config)
    {
        var apiKey = config["OpenAI__ApiKey"]
            ?? throw new InvalidOperationException("OpenAI API key not configured.");
        var model = config["OpenAI__Model"] ?? "gpt-4o";
        var baseUrl = config["OpenAI__BaseUrl"];

        if (!string.IsNullOrEmpty(baseUrl))
        {
            var options = new OpenAIClientOptions { Endpoint = new Uri(baseUrl) };
            _client = new ChatClient(model, new System.ClientModel.ApiKeyCredential(apiKey), options);
        }
        else
        {
            _client = new ChatClient(model, apiKey);
        }
    }

    public async Task<ModeratorResult> SynthesizeAsync(string originalPrompt, List<DebateTranscriptEntry> transcript)
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

        var completion = await _client.CompleteChatAsync(messages,
            new ChatCompletionOptions { ResponseFormat = ChatResponseFormat.CreateJsonObjectFormat() });

        var json = completion.Value.Content[0].Text;
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
