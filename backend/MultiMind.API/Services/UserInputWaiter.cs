using System.Collections.Concurrent;

namespace MultiMind.API.Services;

public interface IUserInputWaiter
{
    Task<string?> WaitAsync(Guid sessionId, CancellationToken ct = default);
    bool TrySubmit(Guid sessionId, string message);
    void Cancel(Guid sessionId);
}

public class UserInputWaiter : IUserInputWaiter
{
    private readonly ConcurrentDictionary<Guid, TaskCompletionSource<string?>> _pending = new();

    public Task<string?> WaitAsync(Guid sessionId, CancellationToken ct = default)
    {
        var tcs = _pending.GetOrAdd(sessionId, _ => new TaskCompletionSource<string?>(
            TaskCreationOptions.RunContinuationsAsynchronously));

        ct.Register(() =>
        {
            if (_pending.TryRemove(sessionId, out var t))
                t.TrySetResult(null);
        });

        return tcs.Task;
    }

    public bool TrySubmit(Guid sessionId, string message)
    {
        if (_pending.TryRemove(sessionId, out var tcs))
        {
            tcs.TrySetResult(message);
            return true;
        }
        return false;
    }

    public void Cancel(Guid sessionId)
    {
        if (_pending.TryRemove(sessionId, out var tcs))
            tcs.TrySetResult(null);
    }
}
