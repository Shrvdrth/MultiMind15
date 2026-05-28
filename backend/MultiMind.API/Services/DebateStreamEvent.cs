namespace MultiMind.API.Services;

public enum DebateEventType
{
    RoundStart,
    AgentStart,
    AgentChunk,
    AgentDone,
    RoundEnd,
    WaitingForUserInput,
    UserInputReceived,
    ModeratorStart,
    ModeratorChunk,
    ModeratorDone,
    DebateComplete,
    Error
}

public record DebateStreamEvent(
    DebateEventType EventType,
    Guid SessionId,
    int? Round = null,
    string? AgentType = null,
    string? Text = null
);
