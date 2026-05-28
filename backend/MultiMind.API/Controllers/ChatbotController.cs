using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MultiMind.API.Services;
using System.Text;
using System.Text.Json;

namespace MultiMind.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatbotController : ControllerBase
{
    private readonly IChatbotService _chatbot;

    public ChatbotController(IChatbotService chatbot)
    {
        _chatbot = chatbot;
    }

    public record ChatbotRequest(string Message, List<ChatbotMessage> History);

    /// <summary>
    /// Stream a chatbot response as SSE.
    /// POST /api/chatbot/message
    /// </summary>
    [HttpPost("message")]
    public async Task StreamMessage([FromBody] ChatbotRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            Response.StatusCode = 400;
            return;
        }

        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        Response.Headers.Append("X-Accel-Buffering", "no");

        try
        {
            await foreach (var chunk in _chatbot.AskAsync(request.Message, request.History ?? [], ct))
            {
                var data = JsonSerializer.Serialize(new { chunk });
                var bytes = Encoding.UTF8.GetBytes($"data: {data}\n\n");
                await Response.Body.WriteAsync(bytes, ct);
                await Response.Body.FlushAsync(ct);
            }

            var doneBytes = Encoding.UTF8.GetBytes("data: [DONE]\n\n");
            await Response.Body.WriteAsync(doneBytes, ct);
            await Response.Body.FlushAsync(ct);
        }
        catch (OperationCanceledException)
        {
            // Client disconnected — normal
        }
    }
}
