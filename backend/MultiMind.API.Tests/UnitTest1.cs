using MultiMind.API.Services;
using Xunit;

namespace MultiMind.API.Tests;

public class UserInputWaiterTests
{
    // ── TrySubmit ───────────────────────────────────────────────────────────

    [Fact]
    public void TrySubmit_NoActiveWaiter_ReturnsFalse()
    {
        var waiter = new UserInputWaiter();
        var result = waiter.TrySubmit(Guid.NewGuid(), "hello");
        Assert.False(result);
    }

    [Fact]
    public async Task TrySubmit_ActiveWaiter_CompletesTaskWithMessage()
    {
        var waiter    = new UserInputWaiter();
        var sessionId = Guid.NewGuid();

        var waitTask = waiter.WaitAsync(sessionId);

        var submitted = waiter.TrySubmit(sessionId, "my input");

        Assert.True(submitted);
        var result = await waitTask;
        Assert.Equal("my input", result);
    }

    [Fact]
    public async Task TrySubmit_CalledTwice_SecondReturnsFalse()
    {
        var waiter    = new UserInputWaiter();
        var sessionId = Guid.NewGuid();

        _ = waiter.WaitAsync(sessionId); // intentionally fire-and-forget; TrySubmit consumes the entry

        Assert.True(waiter.TrySubmit(sessionId, "first"));
        Assert.False(waiter.TrySubmit(sessionId, "second")); // already removed
    }

    // ── Cancel ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Cancel_ActiveWaiter_CompletesTaskWithNull()
    {
        var waiter    = new UserInputWaiter();
        var sessionId = Guid.NewGuid();

        var waitTask = waiter.WaitAsync(sessionId);

        waiter.Cancel(sessionId);

        var result = await waitTask;
        Assert.Null(result);
    }

    [Fact]
    public void Cancel_NoActiveWaiter_DoesNotThrow()
    {
        var waiter = new UserInputWaiter();
        var ex = Record.Exception(() => waiter.Cancel(Guid.NewGuid()));
        Assert.Null(ex);
    }

    // ── CancellationToken ───────────────────────────────────────────────────

    [Fact]
    public async Task WaitAsync_CancellationTokenFired_CompletesTaskWithNull()
    {
        var waiter    = new UserInputWaiter();
        var sessionId = Guid.NewGuid();
        using var cts = new CancellationTokenSource();

        var waitTask = waiter.WaitAsync(sessionId, cts.Token);

        cts.Cancel();

        var result = await waitTask;
        Assert.Null(result);
    }

    [Fact]
    public async Task WaitAsync_CancellationTokenFired_TrySubmitReturnsFalse()
    {
        var waiter    = new UserInputWaiter();
        var sessionId = Guid.NewGuid();
        using var cts = new CancellationTokenSource();

        var waitTask = waiter.WaitAsync(sessionId, cts.Token);
        cts.Cancel();
        await waitTask;

        // After ct fires the entry is removed — TrySubmit should fail
        Assert.False(waiter.TrySubmit(sessionId, "late"));
    }
}

