namespace MultiMind.API.Services;

public interface IDebateEventBus
{
    void CreateChannel(Guid sessionId);
    Task PublishAsync(Guid sessionId, DebateStreamEvent evt);
    IAsyncEnumerable<DebateStreamEvent> SubscribeAsync(Guid sessionId, CancellationToken ct);
    void CloseChannel(Guid sessionId);
    bool HasChannel(Guid sessionId);
}
