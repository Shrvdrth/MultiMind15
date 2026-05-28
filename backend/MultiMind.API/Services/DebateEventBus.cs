using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace MultiMind.API.Services;

public class DebateEventBus : IDebateEventBus
{
    private readonly ConcurrentDictionary<Guid, Channel<DebateStreamEvent>> _channels = new();

    public void CreateChannel(Guid sessionId)
    {
        var channel = Channel.CreateBounded<DebateStreamEvent>(new BoundedChannelOptions(500)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleWriter = false,
            SingleReader = false
        });
        _channels[sessionId] = channel;
    }

    public async Task PublishAsync(Guid sessionId, DebateStreamEvent evt)
    {
        if (_channels.TryGetValue(sessionId, out var channel))
            await channel.Writer.WriteAsync(evt);
    }

    public async IAsyncEnumerable<DebateStreamEvent> SubscribeAsync(
        Guid sessionId,
        [EnumeratorCancellation] CancellationToken ct)
    {
        if (!_channels.TryGetValue(sessionId, out var channel))
            yield break;

        await foreach (var evt in channel.Reader.ReadAllAsync(ct))
        {
            yield return evt;
            if (evt.EventType == DebateEventType.DebateComplete || evt.EventType == DebateEventType.Error)
                yield break;
        }
    }

    public void CloseChannel(Guid sessionId)
    {
        if (_channels.TryRemove(sessionId, out var channel))
            channel.Writer.TryComplete();
    }

    public bool HasChannel(Guid sessionId) => _channels.ContainsKey(sessionId);
}
