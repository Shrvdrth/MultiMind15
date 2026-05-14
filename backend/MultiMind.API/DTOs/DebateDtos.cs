namespace MultiMind.API.DTOs;

public record StartDebateRequest(string Prompt);

public record AgentResponseDto(string AgentType, string ResponseText);

public record DebateRoundDto(int RoundNumber, List<AgentResponseDto> Responses);

public record ModeratorSynthesisDto(
    string Recommendation,
    int ConfidenceScore,
    string KeyDissentingViewpoints,
    string FullSynthesis
);

public record DebateSessionDto(
    Guid SessionId,
    string OriginalPrompt,
    string Status,
    List<DebateRoundDto> Rounds,
    ModeratorSynthesisDto? Synthesis
);
